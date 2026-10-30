import { el, clear } from '../engine/utils/dom.js';
import { GameError, logError } from '../engine/utils/errors.js';
import { createButton } from '../engine/ui/Button.js';
import { confirmDialog } from '../engine/ui/Modal.js';
import { openParentArea } from '../engine/ui/SettingsPanel.js';
import { showToast } from '../engine/ui/Toast.js';
import { ICONS } from '../engine/ui/icons.js';
import { SUBJECTS } from './gamesRegistry.js';
import { resetAllProgress } from './resetProgress.js';

/**
 * Renders the home page: greeting + editable name, total stars, subject
 * filters and the game cards. It only talks to services passed in, and it
 * refreshes itself when another tab changes the data.
 */
export class HubPage {
  #root;
  #games;
  #profile;
  #rewards;
  #storage;
  #settings;
  #rng;

  #subject = 'all';
  #editing = false;
  #header = null;
  #filters = null;
  #grid = null;
  #disposers = [];

  /**
   * @param {{
   *   root: HTMLElement,
   *   games: readonly import('./gamesRegistry.js').GameEntry[],
   *   profile: import('./ProfileService.js').ProfileService,
   *   rewards: import('../engine/services/RewardService.js').RewardService,
   *   storage: import('../engine/services/StorageService.js').StorageService,
   *   settings: import('../engine/services/SettingsService.js').SettingsService,
   *   rng: () => number
   * }} deps
   */
  constructor({ root, games, profile, rewards, storage, settings, rng }) {
    this.#root = root;
    this.#games = games;
    this.#profile = profile;
    this.#rewards = rewards;
    this.#storage = storage;
    this.#settings = settings;
    this.#rng = rng;
  }

  /** Builds the page and starts listening for outside changes. */
  mount() {
    this.#header = el('header', { class: 'hub__header' });
    this.#filters = el('nav', { class: 'hub__filters', attrs: { 'aria-label': 'Subjects' } });
    this.#grid = el('main', { class: 'hub__main', attrs: { id: 'games' } });
    const footer = el('footer', { class: 'hub__footer' },
      createButton({ label: 'Grown-ups', icon: '🔒', variant: 'ghost', onClick: () => this.#openGrownUps() }),
      el('p', { class: 'hub__privacy', text: 'No ads. No sign-up. Everything stays on this device.' }));

    clear(this.#root);
    this.#root.append(this.#header, this.#filters, this.#grid, footer);
    this.#renderAll();

    // Another tab renamed the player or changed progress: show it here too.
    this.#disposers.push(this.#storage.onExternalChange(() => this.#refresh()));
    // Coming back from a game (including via the browser's back button) should show new stars.
    const onPageShow = () => this.#refresh();
    window.addEventListener('pageshow', onPageShow);
    this.#disposers.push(() => window.removeEventListener('pageshow', onPageShow));
    const onVisible = () => { if (!document.hidden) this.#refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    this.#disposers.push(() => document.removeEventListener('visibilitychange', onVisible));
  }

  /** Stops listening. */
  dispose() {
    for (const off of this.#disposers) off();
    this.#disposers = [];
  }

  #renderAll() {
    this.#renderHeader();
    this.#renderFilters();
    this.#renderGrid();
  }

  #refresh() {
    this.#settings.reload();
    // Do not wipe a half-typed name; only update the parts that cannot lose input.
    if (!this.#editing) this.#renderHeader();
    else this.#updateTotal();
    this.#renderGrid();
  }

  // ---------------------------------------------------------------- header

  #renderHeader() {
    const profile = this.#profile.getProfile();
    clear(this.#header);

    const me = this.#editing ? this.#buildNameForm(profile) : this.#buildGreeting(profile);
    const total = el('div', { class: 'hub__total', attrs: { id: 'total-stars' } });
    this.#header.append(
      me,
      total,
      createButton({ icon: '⚙️', ariaLabel: 'Grown-ups settings', variant: 'ghost', onClick: () => this.#openGrownUps() }),
    );
    this.#updateTotal();
  }

  #updateTotal() {
    const total = this.#header.querySelector('#total-stars');
    if (!total) return;
    const stars = this.#rewards.totalStars(this.#games.map((g) => g.slug));
    total.replaceChildren(
      el('span', { class: 'hub__total-icon', html: ICONS.star }),
      el('span', { text: `${stars} ${stars === 1 ? 'star' : 'stars'}` }),
    );
    total.setAttribute('aria-label', `${stars} stars earned in total`);
  }

  #buildGreeting(profile) {
    return el('div', { class: 'hub__me' },
      el('span', { class: 'hub__avatar', text: profile.avatar, attrs: { 'aria-hidden': 'true' } }),
      el('h1', { class: 'hub__greeting', text: `Hi, ${profile.name}!` }),
      createButton({
        icon: '✏️', ariaLabel: 'Change my name', variant: 'ghost',
        onClick: () => { this.#editing = true; this.#renderHeader(); this.#header.querySelector('input')?.focus(); },
      }));
  }

  #buildNameForm(profile) {
    let pendingAvatar = profile.avatar;
    const avatar = el('span', { class: 'hub__avatar', text: pendingAvatar, attrs: { 'aria-hidden': 'true' } });
    const input = el('input', {
      class: 'input hub__name-input',
      attrs: { id: 'name-input', type: 'text', value: profile.name, maxlength: 30, autocomplete: 'off', 'aria-describedby': 'name-msg' },
    });
    const message = el('p', { class: 'message message--bad', attrs: { id: 'name-msg', role: 'alert' } });

    const stopEditing = () => { this.#editing = false; this.#renderHeader(); };

    const form = el('form', { class: 'hub__name-form', attrs: { novalidate: true }, on: {
      submit: (event) => {
        event.preventDefault();
        try {
          this.#profile.rename(input.value, pendingAvatar);
          stopEditing();
        } catch (error) {
          if (error instanceof GameError && error.code === 'INVALID_NAME') {
            // Keep the old name and explain kindly; the input keeps what was typed so it can be fixed.
            message.textContent = error.message;
            input.focus();
          } else {
            logError(error, 'hub:rename');
            message.textContent = 'Oops, we could not save that. Please try again.';
          }
        }
      },
    } },
    el('label', { class: 'sr-only', text: 'Your name', attrs: { for: 'name-input' } }),
    input,
    createButton({
      icon: '🎲', ariaLabel: 'Suggest a new random name',
      onClick: () => {
        try {
          const next = this.#profile.shuffleName();
          input.value = next.name;
          pendingAvatar = next.avatar;
          avatar.textContent = next.avatar;
          message.textContent = '';
        } catch (error) {
          logError(error, 'hub:shuffle');
        }
      },
    }),
    createButton({ label: 'Save', variant: 'primary', onClick: () => form.requestSubmit() }),
    createButton({ label: 'Cancel', onClick: stopEditing }));

    input.addEventListener('keydown', (event) => { if (event.key === 'Escape') stopEditing(); });
    return el('div', { class: 'hub__me hub__me--editing' }, avatar, form, message);
  }

  // --------------------------------------------------------------- filters

  #renderFilters() {
    clear(this.#filters);
    const chips = [{ id: 'all', label: 'All' }, ...SUBJECTS].map(({ id, label }) =>
      el('button', {
        class: 'chip',
        text: label,
        attrs: { type: 'button', 'aria-pressed': String(this.#subject === id) },
        on: { click: () => { this.#subject = id; this.#renderFilters(); this.#renderGrid(); } },
      }));
    this.#filters.append(el('div', { class: 'chips' }, ...chips));
  }

  // ------------------------------------------------------------------ grid

  #renderGrid() {
    clear(this.#grid);
    for (const subject of SUBJECTS) {
      if (this.#subject !== 'all' && this.#subject !== subject.id) continue;
      const games = this.#games.filter((g) => g.subject === subject.id);
      if (games.length === 0) continue;
      const headingId = `section-${subject.id}`;
      this.#grid.append(el('section', { class: 'hub__section', attrs: { 'aria-labelledby': headingId } },
        el('h2', { text: subject.heading, attrs: { id: headingId } }),
        el('ul', { class: 'hub__cards' }, ...games.map((game) => el('li', {}, this.#buildCard(game))))));
    }
  }

  #buildCard(game) {
    const stars = this.#rewards.starsFor(game.slug);
    const isNew = !this.#rewards.hasPlayed(game.slug);
    const body = [
      el('span', { class: 'card__icon', text: game.icon, attrs: { 'aria-hidden': 'true' } }),
      el('span', { class: 'card__title', text: game.title }),
      el('span', { class: 'card__tag', text: game.learningTag }),
    ];

    if (!game.available) {
      return el('div', { class: 'card card--soon', attrs: { 'aria-disabled': 'true' } },
        ...body, el('span', { class: 'card__badge card__badge--soon', text: 'Coming soon' }));
    }
    return el('a', { class: 'card', attrs: { href: game.path } },
      ...body,
      el('span', { class: 'card__stars', attrs: { 'aria-label': `${stars} stars earned` } },
        el('span', { html: ICONS.star }), el('span', { text: String(stars) })),
      isNew ? el('span', { class: 'card__badge', text: 'New' }) : null);
  }

  // ------------------------------------------------------------ grown-ups

  #openGrownUps() {
    return openParentArea({
      settings: this.#settings,
      rng: this.#rng,
      extraSections: [this.#buildResetSection()],
    }).catch((error) => logError(error, 'hub:grown-ups'));
  }

  #buildResetSection() {
    const alsoName = el('input', { attrs: { type: 'checkbox', id: 'reset-name' } });
    const reset = createButton({
      label: 'Reset all progress',
      variant: 'default',
      onClick: async () => {
        const sure = await confirmDialog({
          title: 'Reset all progress?',
          message: 'This clears every star and badge on this device. It cannot be undone.',
          confirmLabel: 'Yes, reset',
        });
        if (!sure) return;
        resetAllProgress({ storage: this.#storage, alsoResetName: alsoName.checked });
        this.#settings.reload();
        this.#editing = false;
        this.#renderAll();
        showToast('Progress cleared.');
      },
    });
    return el('section', { class: 'field' },
      el('h3', { text: 'Reset progress' }),
      el('label', { class: 'toggle' }, alsoName, el('span', { text: 'Also reset name' })),
      reset);
  }
}
