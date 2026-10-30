/**
 * @typedef {import('./deck.js').Card} Card
 * @typedef {'idle'|'oneUp'|'twoUp'} Phase
 * @typedef {{ type: 'ignored', reason: string }
 *   | { type: 'flipped', cardId: number }
 *   | { type: 'matched', pairId: string, ids: [number, number] }
 *   | { type: 'mismatch', ids: [number, number] }} FlipResult
 */

/**
 * The memory-match state machine: `idle -> oneUp -> twoUp -> (matched | mismatch) -> idle`.
 *
 * - `idle`: no card is turned over. `oneUp`: one is. `twoUp`: two are, and they did not match, so the cards stay
 *   visible until the scene calls {@link MatchGame#settle} (after the 1-second look). While `twoUp`, every flip is
 *   ignored, which is what makes rapid tapping during the flip-back harmless.
 * - A matching second card is resolved at once and the game returns to `idle`.
 * - Flipping a card that is already up or matched (a double tap) is ignored, so it never counts as a move.
 *
 * A *move* is one pair of flips.
 */
export class MatchGame {
  #cards;
  #phase = 'idle';
  #first = null;
  #second = null;
  #moves = 0;
  #matchedPairs = 0;
  #totalPairs;

  /** @param {readonly Card[]} deck Face-down cards from `buildDeck`. */
  constructor(deck) {
    this.#cards = deck.map((card) => ({ ...card }));
    this.#totalPairs = this.#cards.length / 2;
  }

  /** @returns {Card[]} A snapshot of the cards (changing it does not change the game). */
  get cards() { return this.#cards.map((c) => ({ ...c })); }
  /** @returns {Phase} */
  get phase() { return this.#phase; }
  get moves() { return this.#moves; }
  get matchedPairs() { return this.#matchedPairs; }
  get totalPairs() { return this.#totalPairs; }
  get done() { return this.#matchedPairs === this.#totalPairs; }

  /**
   * Turns a card face up.
   * @param {number} cardId
   * @returns {FlipResult}
   */
  flip(cardId) {
    const card = this.#cards[cardId];
    if (!card) return { type: 'ignored', reason: 'no-such-card' };
    if (this.#phase === 'twoUp') return { type: 'ignored', reason: 'waiting-for-flip-back' };
    if (card.state !== 'down') return { type: 'ignored', reason: card.state === 'up' ? 'already-up' : 'already-matched' };

    card.state = 'up';
    if (this.#phase === 'idle') {
      this.#first = card;
      this.#phase = 'oneUp';
      return { type: 'flipped', cardId };
    }

    this.#moves += 1;
    const first = this.#first;
    if (first.pairId === card.pairId) {
      first.state = 'matched';
      card.state = 'matched';
      this.#matchedPairs += 1;
      this.#first = null;
      this.#phase = 'idle';
      return { type: 'matched', pairId: card.pairId, ids: [first.id, card.id] };
    }
    this.#second = card;
    this.#phase = 'twoUp';
    return { type: 'mismatch', ids: [first.id, card.id] };
  }

  /**
   * Turns the two mismatched cards back face down and gets ready for the next move.
   * @returns {number[]} The ids that were turned back (empty if nothing was waiting).
   */
  settle() {
    if (this.#phase !== 'twoUp') return [];
    const ids = [this.#first.id, this.#second.id];
    this.#first.state = 'down';
    this.#second.state = 'down';
    this.#first = null;
    this.#second = null;
    this.#phase = 'idle';
    return ids;
  }
}
