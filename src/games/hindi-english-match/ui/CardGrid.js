import { el } from '../../../engine/utils/dom.js';
import { fitTexts } from '../../../engine/ui/fitText.js';
import { ENGLISH, LANGUAGES } from '../logic/languages.js';
import { LEAST_WORD_SCALE } from '../logic/levels.js';

let gridCount = 0;

/**
 * The grid of flip cards (DOM buttons with a CSS 3D flip).
 *
 * Accessibility: every card is a real button with a label that says what it shows ("Hindi card: सेब"), arrow keys move between cards (one
 * card is in the Tab order, like a grid widget), Enter or Space flips a face-down card and says the word on a face-up one. The only text in
 * a card is its word: the language tag ("हिं" / "मरा" / "EN"), the picture, the "?" on the back and the ✔ or 🔊 mark are drawn by the
 * stylesheet, so the words a button shows are the words in its name (WCAG 2.5.3, Label in Name) and none of them is read twice. Language is
 * shown by the tag as well as by tint, and a matched card shows a ✔, so nothing depends on colour alone. The word on a card of Hindi or
 * Marathi carries that language, so a screen reader says it in the right voice.
 *
 * A face-up card is tapped to hear it. A button for that on every card would cover the word on a phone, where a card is little bigger than
 * the button would be, and a face-up card has nothing else to do when it is tapped.
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
 *   focusCard: (id: number) => void,
 *   destroy: () => void
 * }}
 */
export function createCardGrid({ cards, cols, pictures, tinted, speech, onFlip, onSpeak }) {
  const hintId = `card-hint-${gridCount++}`;
  const root = el('div', { class: 'cards', attrs: { role: 'group', 'aria-label': 'Memory cards' }, style: { '--cols': String(cols) } });
  /** @type {{ button: HTMLButtonElement, card: import('../logic/deck.js').Card }[]} */
  const cells = [];
  let current = cards.map((c) => ({ ...c }));
  let showAll = false;
  let roving = 0;

  const focusCard = (id) => {
    roving = Math.max(0, Math.min(cards.length - 1, id));
    cells.forEach((cell, i) => { cell.button.tabIndex = i === roving ? 0 : -1; });
    cells[roving].button.focus();
  };

  /** A word is said on a face-up card, except in Hindi or Marathi when this device has no voice for the language. */
  const hearable = (card) => speech.supported && (card.lang === 'en' || speech.hasVoice(LANGUAGES[card.lang].voice));
  const isUp = (card) => showAll || card.state !== 'down';

  /** A face-down card turns over; a face-up one says its word. */
  const press = (index) => {
    const card = current[index];
    if (!isUp(card)) onFlip(card.id);
    else if (hearable(card)) onSpeak(card);
  };

  cards.forEach((card, index) => {
    const indic = card.lang !== 'en';
    const language = indic ? LANGUAGES[card.lang] : ENGLISH;
    const button = el('button', {
      class: `card3d${tinted ? (indic ? ' is-indic' : ' is-english') : ''}`,
      attrs: { type: 'button', 'data-id': card.id, tabindex: index === 0 ? 0 : -1 },
      on: {
        click: () => { roving = index; press(index); },
        keydown: (event) => {
          const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[event.key];
          if (step === undefined) return;
          event.preventDefault();
          focusCard(index + step);
        },
      },
    },
    el('span', { class: 'card3d__inner' },
      el('span', { class: 'card3d__face card3d__back', attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'card3d__face card3d__front', attrs: { 'aria-hidden': 'true' } },
        // The tag and the picture are drawn from `data-text`; the tag has the language so that its Devanagari is drawn in the right font.
        el('span', { class: 'card3d__tag', attrs: indic ? { 'data-text': language.tag, lang: card.lang } : { 'data-text': language.tag } }),
        el('span', { class: 'card3d__body' },
          el('span', { class: `card3d__text${indic ? ' indic' : ''}`, text: card.text, attrs: indic ? { lang: card.lang } : {} }),
          pictures && card.image ? el('span', { class: 'card3d__image', attrs: { 'data-text': card.image } }) : null))));
    cells.push({ button, card });
    root.append(button);
  });
  // Said by a screen reader after the name of a face-up card that can be heard (see `render`).
  root.append(el('span', { class: 'sr-only', attrs: { id: hintId }, text: 'Press to hear the word.' }));

  function render() {
    cells.forEach((cell, i) => {
      const card = current[i];
      const up = isUp(card);
      const matched = card.state === 'matched';
      const canHear = up && hearable(card);
      cell.button.classList.toggle('is-up', up);
      cell.button.classList.toggle('is-matched', matched);
      cell.button.classList.toggle('is-hearable', canHear);
      const language = card.lang === 'en' ? ENGLISH : LANGUAGES[card.lang];
      cell.button.setAttribute('aria-label', up ? `${language.name} card: ${card.text}${matched ? ', matched' : ''}` : `Card ${i + 1}, face down`);
      // A face-up card that cannot be heard has nothing to do when it is pressed.
      cell.button.setAttribute('aria-disabled', String(up && !canHear));
      if (canHear) cell.button.setAttribute('aria-describedby', hintId);
      else cell.button.removeAttribute('aria-describedby');
    });
  }

  // The words are shrunk to fit their cards (across, and down where a phrase of two lines sits beside a picture). The cards change size with the
  // screen, so this is done again when it does, and again when a font arrives, which changes how wide a word is.
  const fit = () => fitTexts(root, { text: '.card3d__text', box: '.card3d__front', source: 'hindi-english-match:fit-words', least: LEAST_WORD_SCALE, height: true });
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
  observer?.observe(root);
  document.fonts?.addEventListener?.('loadingdone', fit);
  document.fonts?.ready?.then(fit);

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
    destroy() {
      observer?.disconnect();
      document.fonts?.removeEventListener?.('loadingdone', fit);
    },
  };
}
