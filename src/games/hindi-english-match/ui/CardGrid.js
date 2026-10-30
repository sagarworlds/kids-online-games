import { el } from '../../../engine/utils/dom.js';

/**
 * The grid of flip cards (DOM buttons with a CSS 3D flip).
 *
 * Accessibility: every card is a real button with a label that says what it shows ("Hindi card: सेब"), arrow keys
 * move between cards (one card is in the Tab order, like a grid widget), Enter or Space flips. Language is shown by
 * a "हिं" / "EN" tag as well as by tint, and a matched card shows a ✔, so nothing depends on colour alone.
 *
 * Re-rendering only toggles classes and labels, never rebuilds the cards, so the flip transition can play.
 *
 * @param {{
 *   cards: readonly import('../logic/deck.js').Card[],
 *   cols: number,
 *   pictures: boolean,
 *   tinted: boolean,
 *   speech: { supported: boolean, hasVoice: (lang: string) => boolean },
 *   onFlip: (cardId: number) => void,
 *   onSpeak: (card: import('../logic/deck.js').Card) => void
 * }} options
 * @returns {{
 *   el: HTMLElement,
 *   update: (cards: readonly import('../logic/deck.js').Card[], options?: { showAll?: boolean }) => void,
 *   shake: (ids: readonly number[]) => void,
 *   refreshSpeakers: () => void,
 *   focusCard: (id: number) => void
 * }}
 */
export function createCardGrid({ cards, cols, pictures, tinted, speech, onFlip, onSpeak }) {
  const root = el('div', { class: 'cards', attrs: { role: 'group', 'aria-label': 'Memory cards' }, style: { '--cols': String(cols) } });
  /** @type {{ button: HTMLButtonElement, speak: HTMLButtonElement, card: import('../logic/deck.js').Card }[]} */
  const cells = [];
  let current = cards.map((c) => ({ ...c }));
  let showAll = false;
  let roving = 0;

  const focusCard = (id) => {
    roving = Math.max(0, Math.min(cards.length - 1, id));
    cells.forEach((cell, i) => { cell.button.tabIndex = i === roving ? 0 : -1; });
    cells[roving].button.focus();
  };

  cards.forEach((card, index) => {
    const isHindi = card.lang === 'hi';
    const button = el('button', {
      class: `card3d${tinted ? (isHindi ? ' is-hindi' : ' is-english') : ''}`,
      attrs: { type: 'button', 'data-id': card.id, tabindex: index === 0 ? 0 : -1 },
      on: {
        click: () => { roving = index; onFlip(card.id); },
        keydown: (event) => {
          const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[event.key];
          if (step === undefined) return;
          event.preventDefault();
          focusCard(index + step);
        },
      },
    },
    el('span', { class: 'card3d__inner' },
      el('span', { class: 'card3d__face card3d__back', attrs: { 'aria-hidden': 'true' } }, el('span', { text: '?' })),
      el('span', { class: 'card3d__face card3d__front', attrs: { 'aria-hidden': 'true' } },
        el('span', { class: 'card3d__tag', text: isHindi ? 'हिं' : 'EN', attrs: isHindi ? { lang: 'hi' } : {} }),
        el('span', { class: `card3d__text${isHindi ? ' hi' : ''}`, text: card.text, attrs: isHindi ? { lang: 'hi' } : {} }),
        pictures && card.image ? el('span', { class: 'card3d__image', text: card.image }) : null,
        el('span', { class: 'card3d__ok', text: '✔' }))));

    const speak = el('button', {
      class: 'card3d__speak',
      attrs: { type: 'button', 'aria-label': `Hear ${card.text}`, hidden: true },
      on: { click: () => onSpeak(card) },
    }, el('span', { text: '🔊', attrs: { 'aria-hidden': 'true' } }));

    cells.push({ button, speak, card });
    root.append(el('div', { class: 'cell' }, button, speak));
  });

  /** A speaker is shown on a face-up card, except Hindi cards when this device has no Hindi voice. */
  const speakerAllowed = (card) => speech.supported && (card.lang === 'en' || speech.hasVoice('hi-IN'));

  function render() {
    cells.forEach((cell, i) => {
      const card = current[i];
      const up = showAll || card.state !== 'down';
      const matched = card.state === 'matched';
      cell.button.classList.toggle('is-up', up);
      cell.button.classList.toggle('is-matched', matched);
      const language = card.lang === 'hi' ? 'Hindi' : 'English';
      cell.button.setAttribute('aria-label', up ? `${language} card: ${card.text}${matched ? ', matched' : ''}` : `Card ${i + 1}, face down`);
      cell.button.setAttribute('aria-disabled', String(matched));
      cell.speak.hidden = !(up && speakerAllowed(card));
    });
  }

  render();
  return {
    el: root,
    update(next, options = {}) {
      current = next.map((c) => ({ ...c }));
      showAll = Boolean(options.showAll);
      render();
    },
    shake(ids) {
      for (const id of ids) {
        const button = cells[id].button;
        button.classList.remove('shake');
        void button.offsetWidth; // restart the animation if it just ran
        button.classList.add('shake');
        button.addEventListener('animationend', () => button.classList.remove('shake'), { once: true });
      }
    },
    refreshSpeakers: render,
    focusCard,
  };
}
