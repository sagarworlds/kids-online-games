import { PizzaScene } from './PizzaScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { getLevel, CUSTOMERS_PER_ROUND } from '../logic/levels.js';
import { emptyPizza, toggleSlice } from '../logic/pizza.js';
import { newAttempt, serve } from '../logic/counter.js';
import { hintFor, offSlices } from '../logic/orderChecker.js';
import { coinsFor } from '../logic/scoring.js';
import { makeBonus, BONUS_COINS } from '../logic/bonus.js';
import { format } from '../logic/fraction.js';
import { toppingById } from '../logic/toppings.js';
import { createPizzaView } from '../ui/PizzaView.js';
import { createOrderTicket, createFractionEl } from '../ui/OrderTicket.js';
import { createFractionPie, describeLine } from '../ui/FractionPie.js';

const MOODS = { waiting: '🙂', thinking: '🤔', happy: '😋', unhappy: '😞' };
const toppingLabel = (id) => toppingById(id).label;

/** One customer: read the ticket, decorate the pizza, press Serve. */
export class KitchenScene extends PizzaScene {
  #order = null;
  #attempt = null;
  #pizza = null;
  #topping = null;
  #pizzaView = null;
  #hud = null;
  #faceEl = null;
  #speechEl = null;
  #thoughtEl = null;
  #statusEl = null;
  #afterEl = null;
  #trayButtons = new Map();
  #serveButton = null;
  #settled = false;
  #bonusChoices = [];
  /** The result of this customer, filled in when they are served and handed to the next scene. */
  #pending = null;

  /** @param {import('./PizzaScene.js').Round} round */
  enter(round) {
    const { services } = this;
    this.round = round;
    this.level = getLevel(round.levelId);
    this.#order = round.orders[round.index];
    if (!this.#order) throw new GameError('NO_ORDER', `Round has no order number ${round.index}`, { index: round.index });
    this.#attempt = newAttempt(this.#order);
    this.#pizza = emptyPizza(this.#order.slices);
    this.#topping = this.#order.lines[0].topping;

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'customer', label: 'Customer' }, { id: 'coins', label: 'Coins' }],
      onSettings: () => services.openSettings(),
    });
    this.#hud.setStat('customer', `${round.index + 1}/${CUSTOMERS_PER_ROUND}`);
    this.#hud.setStat('coins', this.#coinsSoFar());

    this.#faceEl = el('div', { class: 'customer__face', text: MOODS.waiting, attrs: { 'aria-hidden': 'true' } });
    this.#speechEl = el('p', { class: 'customer__speech', text: `Hi! I'd like a pizza, please.` });
    this.#thoughtEl = el('div', { class: 'thought', attrs: { role: 'group', 'aria-label': 'What the customer wanted' } });
    this.#thoughtEl.hidden = true;
    this.#statusEl = el('p', { class: 'kitchen__status', attrs: { role: 'status' } });
    this.#afterEl = el('div', { class: 'kitchen__after' });

    this.#pizzaView = createPizzaView({ slices: this.#order.slices, onToggle: (i) => this.#onSlice(i) });
    this.#serveButton = createButton({ label: 'Serve', icon: '🍽', variant: 'primary', big: true, onClick: () => this.#serve() });

    const tray = el('div', { class: 'tray', attrs: { role: 'group', 'aria-label': 'Toppings' } },
      ...this.level.toppings.map((id) => this.#toppingButton(id)));
    this.#syncTray();

    this.ui.append(this.#hud.el, el('main', { class: 'kitchen' },
      el('section', { class: 'kitchen__customer' },
        el('div', { class: 'customer' }, this.#faceEl, el('div', { class: 'customer__talk' },
          el('p', { class: 'customer__name', text: this.#order.customer }), this.#speechEl)),
        createOrderTicket(this.#order), this.#thoughtEl),
      el('section', { class: 'kitchen__work' },
        this.#pizzaView.el, tray,
        el('div', { class: 'kitchen__actions' }, this.#serveButton),
        this.#statusEl, this.#afterEl)));
    this.#render();
  }

  #coinsSoFar() {
    return this.round.results.reduce((sum, r) => sum + r.coins, 0);
  }

  #toppingButton(id) {
    const topping = toppingById(id);
    const button = el('button', {
      class: 'topping', attrs: { type: 'button', 'aria-pressed': 'false' },
      on: { click: () => { this.#topping = id; this.#syncTray(); this.services.audio.play('click'); } },
    }, el('span', { class: 'topping__icon', text: topping.icon, attrs: { 'aria-hidden': 'true' } }), el('span', { text: topping.label }));
    this.#trayButtons.set(id, button);
    return button;
  }

  #syncTray() {
    for (const [id, button] of this.#trayButtons) button.setAttribute('aria-pressed', String(id === this.#topping));
  }

  #render(off = []) {
    this.#pizzaView.render(this.#pizza, { off, locked: this.#settled });
  }

  #onSlice(index) {
    if (this.#settled) return;
    this.#pizza = toggleSlice(this.#pizza, index, this.#topping);
    this.services.audio.play('pop');
    // Any change means the old "check these slices" marks are stale.
    this.#render();
    this.#statusEl.textContent = '';
  }

  // ------------------------------------------------------------ serving

  #serve() {
    if (this.#settled) return;
    const outcome = serve(this.#attempt, this.#pizza);
    this.#attempt = outcome.attempt;
    const handlers = { empty: () => this.#onEmpty(), correct: () => this.#onCorrect(outcome), wrong: () => this.#onWrong(outcome), failed: () => this.#onFailed(outcome) };
    const handle = handlers[outcome.kind];
    if (!handle) throw new GameError('BAD_SERVE_OUTCOME', `Unknown serve outcome "${outcome.kind}"`, { kind: outcome.kind });
    handle();
  }

  #onEmpty() {
    this.services.audio.play('boop');
    this.#statusEl.textContent = 'Add some toppings first!';
  }

  #onWrong({ result, retriesLeft }) {
    const { audio } = this.services;
    audio.play('boop');
    this.#setMood('thinking', 'Hmm, not quite what I ordered…');
    this.#showThought(false);
    this.#render(offSlices(this.#order, this.#pizza));
    const tries = retriesLeft === 1 ? '1 try' : `${retriesLeft} tries`;
    this.#statusEl.textContent = `${hintFor(result, toppingLabel)} You have ${tries} left.`;
  }

  #onCorrect({ status }) {
    const { audio } = this.services;
    this.#settle();
    audio.play(status === 'first' ? 'cheer' : 'ding');
    this.#setMood('happy', 'Yum! Thank you!');
    this.#thoughtEl.hidden = true;
    this.#statusEl.textContent = `Perfect! +${coinsFor(status)} coins.`;
    this.#record({ status, coins: coinsFor(status), bonus: null });
    if (this.level.bonus) this.#askBonus();
    else this.#offerNext();
  }

  #onFailed({ result }) {
    this.#settle();
    this.services.audio.play('boop');
    this.#setMood('unhappy', 'Oh no… I will go somewhere else.');
    this.#showThought(true);
    this.#statusEl.textContent = `${hintFor(result, toppingLabel)} No coins this time.`;
    this.#record({ status: 'failed', coins: 0, bonus: null });
    this.#offerNext();
  }

  /** Locks the pizza and the buttons once this customer is done. */
  #settle() {
    this.#settled = true;
    setDisabled(this.#serveButton, true);
    for (const button of this.#trayButtons.values()) button.disabled = true;
    this.#render();
  }

  #setMood(mood, line) {
    this.#faceEl.textContent = MOODS[mood];
    this.#speechEl.textContent = line;
  }

  /** The thought bubble: a little pizza showing what was ordered, so the fraction becomes something you can count. */
  #showThought(final) {
    this.#thoughtEl.replaceChildren(
      el('p', { class: 'thought__title', text: final ? 'This is what I wanted:' : 'I wanted this:' }),
      createFractionPie(this.#order),
      el('p', { class: 'thought__text', text: this.#order.lines.map(describeLine).join(' and ') }));
    this.#thoughtEl.hidden = false;
  }

  // ---------------------------------------------------- after the serve

  #record(partial) {
    this.#pending = { customer: this.#order.customer, summary: this.#order.lines.map(describeLine).join(' and '), ...partial };
    this.#hud.setStat('coins', this.#coinsSoFar() + partial.coins);
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

  /** Hard level: "Which is bigger?" for two fractions. A wrong answer costs nothing; it shows why. */
  #askBonus() {
    const question = makeBonus(this.services.rng);
    const choice = (side) => el('button', {
      class: 'bonus__choice', attrs: { type: 'button', 'aria-label': `${question[side].num} over ${question[side].den}` },
      on: { click: () => this.#answerBonus(question, side) },
    }, createFractionEl(question[side]));
    const choices = [choice('a'), choice('b')];
    this.#afterEl.append(el('section', { class: 'bonus', attrs: { 'aria-label': 'Bonus question' } },
      el('h2', { class: 'bonus__title', text: 'Bonus: which is bigger?' }),
      el('div', { class: 'bonus__choices' }, ...choices)));
    this.#bonusChoices = choices;
    choices[0].focus();
  }

  #answerBonus(question, side) {
    const right = side === question.answer;
    for (const button of this.#bonusChoices) button.disabled = true;
    this.#bonusChoices[side === 'a' ? 0 : 1].classList.add(right ? 'is-right' : 'is-wrong');
    this.#bonusChoices[question.answer === 'a' ? 0 : 1].classList.add('is-answer');
    this.services.audio.play(right ? 'ding' : 'boop');

    const bigger = question[question.answer];
    const smaller = question[question.answer === 'a' ? 'b' : 'a'];
    this.#pending = { ...this.#pending, bonus: right, coins: this.#pending.coins + (right ? BONUS_COINS : 0) };
    this.#hud.setStat('coins', this.#coinsSoFar() + this.#pending.coins);
    const reveal = el('div', { class: 'bonus__reveal' },
      el('p', { class: 'bonus__verdict', text: `${right ? `Yes! +${BONUS_COINS} coins.` : 'Not quite.'} ${format(bigger)} is bigger than ${format(smaller)}.` }),
      ...[bigger, smaller].map((f) => el('div', { class: 'bar', attrs: { role: 'img', 'aria-label': `${format(f)} of a bar` } },
        el('div', { class: 'bar__fill', style: { width: `${(f.num / f.den) * 100}%` }, text: format(f) }))));
    this.#afterEl.append(reveal);
    this.#offerNext();
  }
}
