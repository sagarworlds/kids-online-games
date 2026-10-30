import { HindiScene } from './HindiScene.js';
import { el } from '../../../engine/utils/dom.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { getLevel, MIXED, PEEK_SECONDS, FLIP_BACK_SECONDS } from '../logic/levels.js';
import { pairsForTopic } from '../logic/pairs.js';
import { buildDeck } from '../logic/deck.js';
import { MatchGame } from '../logic/matchState.js';
import { createCardGrid } from '../ui/CardGrid.js';

const FINISH_DELAY_SECONDS = 1.1;
const LANG = { hi: 'hi-IN', en: 'en-IN' };

/** The board: flip two cards at a time. The rules live in {@link MatchGame}; this scene shows and times them. */
export class BoardScene extends HindiScene {
  #game = null;
  #grid = null;
  #hud = null;
  #statusEl = null;
  #peekLeft = 0;
  #settleIn = 0;
  #finishIn = 0;
  #seconds = 0;
  #pairs = [];
  #offVoices = () => {};

  /** @param {{ levelId: 'easy'|'medium'|'hard', topic: string, peek: boolean }} params */
  enter({ levelId, topic, peek }) {
    const { services, data } = this;
    this.levelId = levelId;
    this.topic = topic;
    this.peek = peek;
    const level = getLevel(levelId);
    const pool = pairsForTopic(data.pairs, topic, MIXED);
    const deck = buildDeck(pool, level.pairs, services.rng, { preferSimilar: level.similarWords, needImages: level.pictures });
    this.#game = new MatchGame(deck);
    this.#pairs = [...new Set(deck.map((c) => c.pairId))].map((id) => data.pairs.find((p) => p.pairId === id));

    this.#hud = createHud({
      homeHref: services.game.homeHref, title: services.game.title,
      stats: [{ id: 'moves', label: 'Moves' }, { id: 'pairs', label: 'Pairs' }, { id: 'time', label: 'Time' }],
      onSettings: () => services.openSettings(),
    });
    this.#grid = createCardGrid({
      cards: deck, cols: level.cols, pictures: level.pictures, tinted: level.tinted, speech: services.speech,
      onFlip: (id) => this.#onFlip(id),
      onSpeak: (card) => services.speech.speak(card.text, { lang: LANG[card.lang], force: true }),
    });
    // Voices load after the page does, so a Hindi speaker icon may need to appear (or stay hidden) later.
    this.#offVoices = services.speech.onVoicesChanged(() => this.#grid.refreshSpeakers());
    this.#statusEl = el('p', { class: 'board__status', attrs: { role: 'status' } });

    this.ui.append(this.#hud.el, el('main', { class: 'board' }, this.#statusEl, this.#grid.el));
    this.#peekLeft = peek ? PEEK_SECONDS : 0;
    this.#syncHud();
    if (peek) {
      this.#grid.update(this.#game.cards, { showAll: true });
      this.#statusEl.textContent = `Remember the cards! ${PEEK_SECONDS}`;
    } else {
      this.#statusEl.textContent = 'Find a Hindi word and its English match.';
    }
    this.#grid.focusCard(0);
  }

  exit() {
    this.#offVoices();
    this.services.speech.cancel();
  }

  #onFlip(cardId) {
    // Nothing counts while the cards are being shown or the round is over.
    if (this.#peekLeft > 0 || this.#finishIn > 0) return;
    const result = this.#game.flip(cardId);
    if (result.type === 'ignored') return;

    const { audio, speech } = this.services;
    audio.play('click');
    this.#grid.update(this.#game.cards);
    if (result.type === 'matched') {
      audio.play('chime');
      const pair = this.#pairs.find((p) => p.pairId === result.pairId);
      speech.speakSequence([{ text: pair.hi, lang: LANG.hi }, { text: pair.en, lang: LANG.en }]); // only if read-aloud is on
      this.#statusEl.textContent = `✔ ${pair.hi} = ${pair.en}`;
    } else if (result.type === 'mismatch') {
      audio.play('boop');
      this.#grid.shake(result.ids);
      this.#statusEl.textContent = '✖ Not a match. Remember where they are!';
      this.#settleIn = FLIP_BACK_SECONDS;
    }
    this.#syncHud();
    if (this.#game.done) this.#finishIn = FINISH_DELAY_SECONDS;
  }

  #syncHud() {
    this.#hud.setStat('moves', this.#game.moves);
    this.#hud.setStat('pairs', `${this.#game.matchedPairs}/${this.#game.totalPairs}`);
    const m = Math.floor(this.#seconds / 60);
    this.#hud.setStat('time', `${m}:${String(Math.floor(this.#seconds % 60)).padStart(2, '0')}`);
  }

  update(dt) {
    if (this.#peekLeft > 0) {
      const before = Math.ceil(this.#peekLeft);
      this.#peekLeft -= dt;
      if (this.#peekLeft <= 0) {
        this.#peekLeft = 0;
        this.#grid.update(this.#game.cards);
        this.#statusEl.textContent = 'Go! Find a Hindi word and its English match.';
      } else if (Math.ceil(this.#peekLeft) !== before) {
        this.#statusEl.textContent = `Remember the cards! ${Math.ceil(this.#peekLeft)}`;
      }
      return; // the clock starts when the cards go face down
    }
    if (this.#finishIn > 0) {
      this.#finishIn -= dt;
      if (this.#finishIn <= 0) {
        this.routes.results({ levelId: this.levelId, topic: this.topic, peek: this.peek, moves: this.#game.moves, seconds: Math.round(this.#seconds), pairs: this.#pairs });
      }
      return;
    }
    this.#seconds += dt;
    this.#syncHud();
    if (this.#settleIn > 0) {
      this.#settleIn -= dt;
      if (this.#settleIn <= 0) {
        this.#settleIn = 0;
        this.#game.settle();
        this.#grid.update(this.#game.cards);
      }
    }
  }
}
