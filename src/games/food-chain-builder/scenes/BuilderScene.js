import { FoodScene } from './FoodScene.js';
import { el } from '../../../engine/utils/dom.js';
import { GameError } from '../../../engine/utils/errors.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { launchConfetti } from '../../../engine/ui/Confetti.js';
import { LEVELS, HINT_AFTER_CHECKS } from '../logic/levels.js';
import { addLink, removeLink, check, linkKey } from '../logic/linkChecker.js';
import { wrongMessage, missingHint, checkSummary } from '../logic/messages.js';
import { computeLayout } from '../logic/layout.js';
import { builderStars } from '../logic/scoring.js';
import { introSeen, withIntroSeen } from '../logic/learned.js';
import { createOrganismCard } from '../ui/OrganismCard.js';
import { createInfoPanel } from '../ui/InfoPanel.js';
import { createArrowLayer } from '../ui/ArrowLayer.js';
import { attachLinkGesture } from '../ui/LinkGesture.js';

/** A board at least this wide (in pixels) lays the levels out left to right; a narrower one (a phone) bottom to top. */
const HORIZONTAL_FROM = 620;
const INTRO_TEXT = 'Arrows show where the energy goes: from the food to the one that eats it. An arrow from grass to rabbit means the rabbit eats the grass. Drag from the food to its eater, or tap the food first and then the eater.';

/**
 * The builder: the living things of one habitat sit on a board and the child draws arrows from each food to what eats it.
 * Dragging draws an arrow; so does tapping (or pressing Enter on) the food and then the eater, which is the keyboard way.
 * Tap an arrow and press Eraser (or press Delete on it) to remove it. Check marks every arrow right or wrong, with the
 * reason for each wrong one, and when everything is there the food web comes alive.
 */
export class BuilderScene extends FoodScene {
  #habitat = null;
  #place = null;
  #config = null;
  #links = [];
  #states = new Map();
  #selectedKey = null;
  #pending = null;
  #checks = 0;
  #missingChecks = 0;
  #wrongAtFirstCheck = null;
  #locked = false;
  #orientation = null;
  #frame = 0;
  #hud = null;
  #board = null;
  #wraps = new Map();
  #layer = null;
  #gesture = null;
  #observer = null;
  #statusEl = null;
  #countEl = null;
  #messagesEl = null;
  #infoEl = null;
  #introEl = null;
  #afterEl = null;
  #buttons = {};
  #hoverId = null;

  /** @param {{ habitatId: string }} params */
  enter({ habitatId }) {
    const { services, data } = this;
    this.#habitat = this.habitat(habitatId);
    if (!this.#habitat) throw new GameError('UNKNOWN_HABITAT', `There is no habitat "${habitatId}"`, { habitatId });
    this.#place = this.place(this.#habitat.place);
    this.#config = LEVELS[this.#habitat.level];

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: `${this.#place.name} · ${this.#config.label}`,
      onSettings: () => services.openSettings(),
    });
    this.#statusEl = el('p', { class: 'build__status', attrs: { role: 'status' } });
    this.#countEl = el('p', { class: 'build__count' });
    this.#messagesEl = el('ul', { class: 'build__messages' });
    this.#infoEl = el('div', { class: 'build__info' });
    this.#afterEl = el('div', { class: 'build__after' });
    this.#introEl = this.#makeIntro();

    this.#layer = createArrowLayer({
      onSelect: (link) => this.#selectArrow(link),
      onRemove: (link) => this.#erase(link),
      describe: (link, state) => `${data.lookup.get(link.from).name} is eaten by ${data.lookup.get(link.to).name}${state === 'correct' ? '. Right.' : state === 'wrong' ? '. Wrong.' : '.'}`,
    });
    this.#board = el('div', { class: `board board--${this.#place.id}`, attrs: { role: 'group', 'aria-label': `${this.#place.name}. Draw an arrow from each food to the one that eats it.` } });
    for (const id of this.#habitat.organisms) {
      const { el: wrap, card } = createOrganismCard(data.lookup.get(id), { showRole: this.#config.showRoles, onInfo: (organism) => this.#showInfo(organism) });
      card.addEventListener('click', () => this.#onCard(id));
      this.#wraps.set(id, wrap);
      this.#board.append(wrap);
    }
    this.#board.append(this.#layer.el, this.#layer.liveEl);

    this.#gesture = attachLinkGesture(this.#board, {
      cardIdAt: (x, y) => document.elementFromPoint(x, y)?.closest?.('.card')?.dataset.id ?? null,
      centreOf: (id) => { const r = this.#rectOf(id); return r && { x: r.x + r.w / 2, y: r.y + r.h / 2 }; },
      toBoard: (x, y) => { const b = this.#board.getBoundingClientRect(); return { x: x - b.left, y: y - b.top }; },
      onLive: (from, to, over) => this.#onLive(from, to, over),
      onLink: (from, to) => this.#tryLink(from, to),
      canStart: () => !this.#locked,
    });

    this.#buttons.check = createButton({ label: 'Check', icon: '✔', variant: 'primary', big: true, onClick: () => this.#check() });
    this.#buttons.erase = createButton({ label: 'Eraser', icon: '🧽', onClick: () => this.#erase() });
    this.#buttons.help = createButton({ label: 'How it works', icon: '❓', onClick: () => { this.#introEl.hidden = !this.#introEl.hidden; } });
    setDisabled(this.#buttons.erase, true);

    this.ui.append(this.#hud.el, el('main', { class: 'build' },
      this.#introEl,
      el('p', { class: 'build__help', text: 'Draw an arrow from each food to the one that eats it.' }),
      this.#board, this.#countEl,
      el('div', { class: 'build__actions', attrs: { role: 'group', 'aria-label': 'Actions' } }, this.#buttons.check, this.#buttons.erase, this.#buttons.help),
      this.#statusEl, this.#messagesEl, this.#afterEl, this.#infoEl));

    this.#observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.#scheduleLayout());
    this.#observer?.observe(this.#board);
    this.#scheduleLayout();
    this.#syncHud();
  }

  exit() {
    this.#gesture?.destroy();
    this.#observer?.disconnect();
    cancelAnimationFrame(this.#frame);
  }

  // ---------------------------------------------------------------- intro, info

  /** The note about which way arrows go. It is open the first time the game is ever played, then only on request. */
  #makeIntro() {
    const { services } = this;
    const seen = introSeen(services.rewards.getSave(services.game.slug).extra);
    const note = el('section', { class: 'intro', attrs: { 'aria-label': 'Which way do the arrows go?' } },
      el('h2', { class: 'intro__title', text: 'Which way do the arrows go?' }),
      el('p', { class: 'intro__text', text: INTRO_TEXT }),
      createButton({ label: 'Got it', icon: '👍', variant: 'primary', onClick: () => {
        note.hidden = true;
        services.rewards.update(services.game.slug, (save) => { save.extra = withIntroSeen(save.extra); });
      } }));
    note.hidden = seen;
    return note;
  }

  #showInfo(organism) {
    this.#infoEl.replaceChildren(createInfoPanel(organism, { onClose: () => this.#infoEl.replaceChildren() }));
    this.#infoEl.scrollIntoView?.({ block: 'nearest' });
  }

  // ------------------------------------------------------------------- layout

  #scheduleLayout() {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => { this.#frame = 0; this.#applyLayout(); });
  }

  /** Puts each card in its place for the shape of the board, then redraws the arrows to match. */
  #applyLayout() {
    const width = this.#board.clientWidth;
    if (!width) return;
    const orientation = width >= HORIZONTAL_FROM ? 'horizontal' : 'vertical';
    if (orientation !== this.#orientation) {
      this.#orientation = orientation;
      this.#board.classList.toggle('board--vertical', orientation === 'vertical');
      const positions = computeLayout(this.#habitat, orientation);
      for (const [id, point] of positions) {
        this.#wraps.get(id).style.left = `${point.x}%`;
        this.#wraps.get(id).style.top = `${point.y}%`;
      }
    }
    this.#redraw();
  }

  /** A card's rectangle in board pixels, which is what the arrows are drawn in. */
  #rectOf(id) {
    const card = this.#wraps.get(id)?.querySelector('.card');
    if (!card) return null;
    const b = this.#board.getBoundingClientRect();
    const r = card.getBoundingClientRect();
    return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
  }

  #redraw() {
    this.#layer.update({ links: this.#links, states: this.#states, selected: this.#selectedKey, rectOf: (id) => this.#rectOf(id) });
    this.#syncHud();
  }

  #syncHud() {
    this.#countEl.textContent = `Arrows drawn: ${this.#links.length} of ${this.#habitat.required.length}. Tap the i on a card to learn about it.`;
    setDisabled(this.#buttons.erase, this.#locked || this.#selectedKey === null);
  }

  // ------------------------------------------------------------------ drawing

  /** The line that follows a finger or mouse while dragging, and the card it is over. */
  #onLive(from, to, overId) {
    // A real drag is a different gesture from tap-then-tap, so it drops any half-finished tap selection.
    if (from !== null && this.#pending !== null) this.#setPending(null);
    this.#layer.showLive(from, to);
    if (overId !== this.#hoverId) {
      if (this.#hoverId) this.#wraps.get(this.#hoverId)?.classList.remove('is-target');
      if (overId) this.#wraps.get(overId)?.classList.add('is-target');
      this.#hoverId = overId ?? null;
    }
    this.#board.classList.toggle('is-dragging', from !== null);
  }

  /** A tap or Enter on a card: first the food, then the one that eats it. */
  #onCard(id) {
    if (this.#locked) return;
    const name = (cardId) => this.data.lookup.get(cardId).name.toLowerCase();
    if (this.#pending === null) {
      this.#setPending(id);
      this.#say(`The ${name(id)} is the food. Now pick the one that eats it.`, 'info');
    } else if (this.#pending === id) {
      this.#setPending(null);
      this.#say('', 'info');
    } else {
      const from = this.#pending;
      this.#setPending(null);
      this.#tryLink(from, id);
    }
  }

  #setPending(id) {
    if (this.#pending) this.#wraps.get(this.#pending)?.classList.remove('is-source');
    this.#pending = id;
    if (id) this.#wraps.get(id)?.classList.add('is-source');
  }

  #tryLink(from, to) {
    const result = addLink(this.#links, { from, to }, this.#habitat);
    if (!result.added) return; // a self-link or a repeat: the child just did not draw anything new
    this.#links = result.links;
    this.#selectedKey = null;
    this.services.audio.play('pop');
    const { lookup } = this.data;
    this.#say(`Arrow drawn: ${lookup.get(from).name} to ${lookup.get(to).name}.`, 'info');
    this.#redraw();
  }

  #selectArrow(link) {
    if (this.#locked) return;
    this.#setPending(null);
    const key = linkKey(link);
    this.#selectedKey = this.#selectedKey === key ? null : key;
    this.#say(this.#selectedKey ? 'Arrow picked. Press Eraser to remove it.' : '', 'info');
    this.#redraw();
  }

  #erase(link = null) {
    if (this.#locked) return;
    const target = link ?? this.#links.find((l) => linkKey(l) === this.#selectedKey);
    if (!target) return;
    this.#links = removeLink(this.#links, target);
    this.#states.delete(linkKey(target));
    this.#selectedKey = null;
    this.services.audio.play('click');
    this.#say('Arrow removed.', 'info');
    this.#redraw();
  }

  // -------------------------------------------------------------------- check

  #check() {
    const { services, data } = this;
    if (this.#locked) return;
    if (this.#links.length === 0) {
      this.#say('Draw an arrow first: drag from the food to the one that eats it.', 'info');
      return;
    }
    const result = check(this.#links, this.#habitat);
    this.#checks += 1;
    // The first Check decides the stars, so a child who fixes things afterwards still finishes, but with fewer stars.
    if (this.#wrongAtFirstCheck === null) this.#wrongAtFirstCheck = result.wrong.length;
    this.#states = new Map([
      ...result.correct.map((l) => [linkKey(l), 'correct']),
      ...result.wrong.map(({ link }) => [linkKey(link), 'wrong']),
    ]);
    this.#selectedKey = null;
    this.#messagesEl.replaceChildren(...result.wrong.map((w) => el('li', {},
      el('span', { html: ICONS.cross, attrs: { 'aria-hidden': 'true' } }), ` ${wrongMessage(w, data.lookup)}`)));

    let text = checkSummary(result);
    for (const wrap of this.#wraps.values()) wrap.classList.remove('is-hint');
    if (!result.complete && result.missing.length) {
      this.#missingChecks += 1;
      if (this.#missingChecks >= HINT_AFTER_CHECKS) {
        text += ` ${missingHint(result.missing[0], data.lookup)}`;
        this.#wraps.get(result.missing[0].from)?.classList.add('is-hint');
      }
    }
    this.#say(text, result.wrong.length ? 'bad' : 'good');
    services.audio.play(result.wrong.length ? 'boop' : 'ding');
    services.speech.speak(text);
    this.#redraw();
    if (result.complete) this.#alive();
  }

  /** Everything is drawn and right: the food web comes alive. */
  #alive() {
    const { services } = this;
    this.#locked = true;
    this.#board.classList.add('is-alive');
    services.audio.play(`ambient-${this.#place.ambient}`);
    services.audio.play('cheer');
    launchConfetti({ rng: services.rng, count: 50 });
    setDisabled(this.#buttons.check, true);
    const stars = builderStars(this.#wrongAtFirstCheck ?? 0);
    const next = createButton({
      label: this.#config.whatIf ? 'What if?' : 'See my results', icon: this.#config.whatIf ? '🤔' : '⭐', variant: 'primary', big: true,
      onClick: () => {
        const round = { habitat: this.#habitat, builderStars: stars, wrongAtFirstCheck: this.#wrongAtFirstCheck ?? 0 };
        if (this.#config.whatIf) this.routes.whatIf(round);
        else this.routes.results({ ...round, stars, whatIf: null });
      },
    });
    this.#afterEl.replaceChildren(next);
    next.focus();
    this.#syncHud();
  }

  #say(text, tone) {
    this.#statusEl.className = `build__status build__status--${tone}`;
    this.#statusEl.textContent = text;
  }
}
