import { ShopKeeperScene } from './ShopKeeperScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { getLevel, CUSTOMERS_PER_ROUND, MAX_TRAY_PIECES, MAX_CHANGE_RETRIES } from '../logic/levels.js';
import { formatMoney, findDenomination } from '../logic/currency.js';
import { minBreakdown, sum } from '../logic/change.js';
import { startCustomer, submitTotal, submitChange, submitNoChange, statusOf } from '../logic/customer.js';
import { changeMessage, totalMessage } from '../logic/messages.js';
import { saleScore } from '../logic/scoring.js';
import { createCounter } from '../ui/Counter.js';
import { createCashDrawer } from '../ui/CashDrawer.js';
import { createChangeTray } from '../ui/ChangeTray.js';
import { createPiece } from '../ui/MoneyPiece.js';

const MOODS = { waiting: '🙂', thinking: '🤔', happy: '😄', unhappy: '😟' };

/** One customer: add up the bill (Medium and Hard), then give the change by dragging money into the tray. */
export class ShopScene extends ShopKeeperScene {
  #customer = null;
  #tray = [];
  #settled = false;
  /** Medium and Hard show the tray total only after "Give change" has been pressed. */
  #revealTray = false;
  #pending = null;
  #hud = null;
  #counter = null;
  #trayView = null;
  #faceEl = null;
  #speechEl = null;
  #changeSection = null;
  #statusEl = null;
  #afterEl = null;
  #buttons = {};

  /** @param {import('./ShopKeeperScene.js').Round} round */
  enter(round) {
    const { services } = this;
    const { currency } = this.data;
    this.round = round;
    this.level = getLevel(round.levelId);
    const sale = round.sales[round.index];
    if (!sale) throw new GameError('NO_SALE', `Round has no customer number ${round.index}`, { index: round.index });
    this.#customer = startCustomer(sale, this.level);

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'customer', label: 'Customer' }, { id: 'score', label: 'Score' }],
      onSettings: () => services.openSettings(),
    });
    this.#hud.setStat('customer', `${round.index + 1}/${CUSTOMERS_PER_ROUND}`);
    this.#hud.setStat('score', this.#scoreSoFar());

    this.#faceEl = el('div', { class: 'customer__face', text: MOODS.waiting, attrs: { 'aria-hidden': 'true' } });
    this.#speechEl = el('p', { class: 'customer__speech', text: 'Hello! I would like to buy these, please.' });
    this.#statusEl = el('p', { class: 'shop__status', attrs: { role: 'status' } });
    this.#afterEl = el('div', { class: 'shop__after' });

    this.#counter = createCounter({ sale, currency, showTotal: this.level.showTotal, onSubmitTotal: (typed) => this.#onTotal(typed) });

    const drawer = createCashDrawer({ currency, getTrayZone: () => this.#trayView.zone, onAdd: (denomination) => this.#addPiece(denomination) });
    this.#trayView = createChangeTray({ currency, getDrawerZone: () => drawer.el, onRemove: (index) => this.#removePiece(index) });

    this.#buttons.give = createButton({ label: 'Give change', icon: '🤝', variant: 'primary', big: true, onClick: () => this.#giveChange() });
    const actions = el('div', { class: 'shop__actions' }, this.#buttons.give);
    if (this.level.noChangeButton) {
      this.#buttons.none = createButton({ label: 'No change needed', onClick: () => this.#noChange() });
      actions.append(this.#buttons.none);
    }

    const payment = el('section', { class: 'payment', attrs: { 'aria-label': 'The customer pays' } },
      el('h2', { class: 'shop__heading', text: `The customer pays ${formatMoney(sale.paidTotal, currency)}` }),
      el('div', { class: 'payment__notes' }, ...sale.paid.map((value) => createPiece(findDenomination(currency, value, 'note'), currency, { tag: 'div' }))));

    this.#changeSection = el('div', { class: 'shop__change' }, payment, this.#trayView.el, drawer.el, actions);
    this.#changeSection.hidden = !this.level.showTotal; // Medium and Hard work out the total first

    this.ui.append(this.#hud.el, el('main', { class: 'shop' },
      el('section', { class: 'shop__counter' },
        el('div', { class: 'customer' }, this.#faceEl, el('div', { class: 'customer__talk' },
          el('p', { class: 'customer__name', text: `Customer ${round.index + 1}` }), this.#speechEl)),
        this.#counter.el),
      el('section', { class: 'shop__work' }, this.#changeSection, this.#statusEl, this.#afterEl)));
    this.#renderTray();
    if (!this.level.showTotal) this.#counter.focusInput();
  }

  #scoreSoFar() {
    return this.round.results.reduce((total, r) => total + r.score, 0);
  }

  #setMood(mood, line) {
    this.#faceEl.textContent = MOODS[mood];
    this.#speechEl.textContent = line;
  }

  // ---------------------------------------------------------- the total

  #onTotal(typed) {
    const { currency } = this.data;
    const { sale } = this.#customer;
    const result = submitTotal(this.#customer, typed);
    this.#customer = result.customer;
    const { audio } = this.services;
    const handlers = {
      invalid: () => { audio.play('boop'); this.#counter.setTotalMessage('Type the total as a number, like 85.'); },
      wrong: () => { audio.play('boop'); this.#counter.setTotalMessage(totalMessage('wrong', sale, result.wrongCount, currency)); },
      correct: () => { audio.play('ding'); this.#startChange('Yes! That is the total. Now give the change.'); },
      revealed: () => { audio.play('boop'); this.#startChange(totalMessage('revealed', sale, 3, currency)); },
    };
    const handle = handlers[result.kind];
    if (!handle) throw new GameError('BAD_TOTAL_OUTCOME', `Unknown total outcome "${result.kind}"`, { kind: result.kind });
    handle();
  }

  /** The total is settled: show it, then open the till for change. */
  #startChange(message) {
    this.#counter.confirmTotal(this.#customer.sale.total);
    this.#counter.setTotalMessage(message);
    this.#changeSection.hidden = false;
    this.#setMood('waiting', 'Here is my money.');
    this.#changeSection.querySelector('.piece')?.focus();
  }

  // ---------------------------------------------------------- the tray

  /** @returns {boolean} False when refused (the tray is full), so a drag snaps back. */
  #addPiece(denomination) {
    if (this.#settled || this.#customer.phase !== 'change') return false;
    if (this.#tray.length >= MAX_TRAY_PIECES) {
      this.services.audio.play('boop');
      this.#statusEl.textContent = 'The tray is full. Tap a piece in the tray to put it back.';
      return false;
    }
    this.#tray.push(denomination);
    this.services.audio.play('click');
    this.#statusEl.textContent = '';
    this.#renderTray();
    return true;
  }

  #removePiece(index) {
    if (this.#settled) return;
    this.#tray.splice(index, 1);
    this.services.audio.play('pop');
    this.#statusEl.textContent = '';
    this.#renderTray();
  }

  #renderTray() {
    const showTotal = this.level.liveTray || this.#revealTray || this.#settled;
    this.#trayView.render(this.#tray, { total: showTotal ? sum(this.#tray.map((d) => d.value)) : null, locked: this.#settled });
  }

  // --------------------------------------------------------- the change

  #giveChange() {
    if (this.#settled) return;
    const { currency } = this.data;
    const result = submitChange(this.#customer, this.#tray.map((d) => d.value), currency.denominations);
    this.#customer = result.customer;
    if (result.kind !== 'empty') this.#revealTray = true;
    const handlers = {
      empty: () => this.#onWrong(result),
      exact: () => this.#onRight(result.check),
      tooMuch: () => this.#onWrong(result),
      tooLittle: () => this.#onWrong(result),
      failed: () => this.#onFailed(result),
    };
    const handle = handlers[result.kind];
    if (!handle) throw new GameError('BAD_CHANGE_OUTCOME', `Unknown change outcome "${result.kind}"`, { kind: result.kind });
    handle();
  }

  #noChange() {
    if (this.#settled) return;
    const { currency } = this.data;
    const result = submitNoChange(this.#customer);
    this.#customer = result.customer;
    if (result.kind === 'exact') {
      this.#onRight({ pieces: 0, fewest: 0, smart: true }, 'The customer paid exactly, so no change is needed. Well spotted!');
    } else if (result.kind === 'owed') {
      this.services.audio.play('boop');
      this.#setMood('thinking', 'Hmm, did I get my change?');
      this.#statusEl.textContent = `The customer is owed ${formatMoney(result.due, currency)} in change. ${this.#retriesText()}`;
    } else {
      this.#onFailed({ kind: 'failed', check: { kind: 'tooLittle' }, diff: result.due }, `The customer is owed ${formatMoney(result.due, currency)} in change.`);
    }
  }

  #retriesText() {
    const left = MAX_CHANGE_RETRIES - this.#customer.changeWrong + 1;
    return `You have ${left === 1 ? '1 try' : `${left} tries`} left.`;
  }

  #onWrong(result) {
    const { currency } = this.data;
    this.services.audio.play('boop');
    this.#renderTray();
    this.#setMood('thinking', result.kind === 'empty' ? 'I am waiting for my change…' : 'Hmm, that does not look right…');
    const note = result.kind === 'empty' ? '' : ` ${this.#retriesText()}`;
    this.#statusEl.textContent = `${changeMessage(result, currency, this.level)}${note}`;
  }

  #onRight(check, customMessage) {
    const { currency } = this.data;
    const { sale } = this.#customer;
    this.services.audio.play(check.smart ? 'cheer' : 'ding');
    this.#settle('happy', 'Thank you! Ka-ching!');
    const how = customMessage
      ?? (check.smart
        ? `Ka-ching! Exact change in the fewest pieces (${check.pieces}). ★ Smart change!`
        : `Ka-ching! Exact change. You used ${check.pieces} pieces; the fewest possible is ${check.fewest}.`);
    this.#statusEl.textContent = how;
    this.#record(check, sale);
  }

  /** Three wrong tries: show the right change so the child can learn from it, and move on. */
  #onFailed(result, message) {
    const { currency } = this.data;
    const { sale } = this.#customer;
    this.services.audio.play('boop');
    this.#tray = minBreakdown(sale.changeDue, currency.denominations).map((value) => findDenomination(currency, value));
    this.#settle('unhappy', 'Oh no… I will check my change later.');
    const why = message ?? changeMessage(result, currency, this.level);
    this.#statusEl.textContent = sale.changeDue > 0
      ? `${why} The right change is ${formatMoney(sale.changeDue, currency)}, shown in the tray.`
      : `${why} No change was needed this time.`;
    this.#record({ pieces: result.check?.pieces ?? 0, fewest: minBreakdown(sale.changeDue, currency.denominations)?.length ?? 0, smart: false }, sale);
  }

  /** Locks the till once this customer is done. */
  #settle(mood, line) {
    this.#settled = true;
    this.#setMood(mood, line);
    this.#buttons.give.disabled = true;
    if (this.#buttons.none) this.#buttons.none.disabled = true;
    this.#renderTray();
  }

  #record({ pieces, fewest, smart }, sale) {
    const status = statusOf(this.#customer);
    const score = saleScore(status, smart);
    this.#pending = {
      customer: `Customer ${this.round.index + 1}`, bill: sale.total, paid: sale.paidTotal, changeDue: sale.changeDue,
      status, smart, pieces, fewest, score,
    };
    this.#hud.setStat('score', this.#scoreSoFar() + score);
    this.#offerNext();
  }

  #offerNext() {
    const last = this.round.index + 1 >= CUSTOMERS_PER_ROUND;
    const next = createButton({
      label: last ? 'See results' : 'Next customer', icon: '▶', variant: 'primary', big: true,
      onClick: () => {
        const round = { ...this.round, index: this.round.index + 1, results: [...this.round.results, this.#pending] };
        if (last) this.routes.results(round);
        else this.routes.play(round);
      },
    });
    this.#afterEl.append(next);
    next.focus();
  }
}
