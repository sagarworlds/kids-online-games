import { NinjaScene } from './NinjaScene.js';
import { el } from '../../../engine/utils/dom.js';
import { clamp } from '../../../engine/utils/geometry.js';
import { createRng } from '../../../engine/utils/random.js';
import { prefersReducedMotion } from '../../../engine/utils/motion.js';
import { createButton } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { ICONS } from '../../../engine/ui/icons.js';
import { NinjaRound, START_SHIELDS } from '../logic/round.js';
import { appendDigit, backspace, parseAnswer } from '../logic/answerInput.js';
import { problemToSpeech, problemToText } from '../logic/hints.js';
import { createNumberPad } from '../ui/NumberPad.js';

const READY_SECONDS = 1.2;
/** A star that lands shows its correct answer for 1.5 s (a learning moment). */
const REVEAL_SECONDS = 1.5;
const FEEDBACK_SECONDS = 1.2;
const BANNER_SECONDS = 1.4;
const HINT_SECONDS = 7;
/** Pause between the last event and the results screen, so the child sees what just happened. */
const END_DELAY = { complete: 0.9, shields: 1.9 };

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", sans-serif';
const PLATE_HEIGHT = 48;
const INK = '#1f2544';
/** A star in the bottom quarter of its fall gets a warning badge, so urgency is not shown by colour alone. */
const URGENT_FROM = 0.75;

/** Traces a five-pointed star path centred on (0, 0). */
function starPath(ctx, outer, inner) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/**
 * Gameplay: sums fall as stars; the child types the answer (keyboard or
 * on-screen pad) before they land. All rules live in {@link NinjaRound}; this
 * scene only feeds it input and draws and announces what it reports.
 */
export class PlayScene extends NinjaScene {
  #round = null;
  #reduced = false;
  #lanes = 5;

  // geometry (CSS px)
  #width = 0;
  #height = 0;
  #fieldTop = 0;
  #groundY = 0;
  #sinceMeasure = 0;

  // state
  #buffer = '';
  #paused = false;
  #finishing = false;
  #done = false;
  #endCountdown = 0;
  #ready = READY_SECONDS;
  #time = 0;
  #shownShields = -1;
  #srSignature = '';

  // transient effects (all advance with dt, so they freeze while paused)
  #fx = [];
  #reveals = [];
  #feedbackTtl = 0;
  #bannerTtl = 0;
  #hintTtl = 0;

  // DOM
  #hud = null;
  #panel = null;
  #answerRow = null;
  #answerEl = null;
  #feedbackEl = null;
  #hintEl = null;
  #bannerEl = null;
  #pauseEl = null;
  #resumeButton = null;
  #announcer = null;
  #srList = null;
  #pad = null;
  #skyStars = [];
  #offs = [];

  /** @param {{ levelId: 'easy'|'medium'|'hard', ops: string[] }} params */
  enter({ levelId, ops }) {
    const { services } = this;
    this.#reduced = prefersReducedMotion();
    // Fewer lanes on narrow screens so side-by-side stars do not overlap.
    this.#lanes = clamp(Math.floor((this.ui.clientWidth || 800) / 190), 3, 5);
    this.#round = new NinjaRound({ levelId, ops, rng: services.rng, lanes: this.#lanes });

    const skyRng = createRng(20261030);
    this.#skyStars = Array.from({ length: 60 }, () => ({ x: skyRng(), y: skyRng(), r: 0.6 + skyRng() * 1.4, phase: skyRng() * 6 }));

    this.ui.classList.add('play');
    this.#buildDom();
    this.#renderAnswer();
    this.#syncHud();
    this.#announce(`Ready? Go! ${this.#round.level.label} level.`);

    this.#offs.push(
      services.input.on('key', (event) => this.#onKey(event)),
      // A hidden tab must not keep stars falling.
      services.input.on('visibility', ({ hidden }) => { if (hidden) this.#setPaused(true); }),
    );
  }

  exit() {
    for (const off of this.#offs) off();
    this.#offs = [];
    this.services.speech.cancel();
  }

  resize(width, height) {
    this.#width = width;
    this.#height = height;
    this.#measure();
  }

  // ------------------------------------------------------------------ DOM

  #buildDom() {
    const { services } = this;
    this.#hud = createHud({
      homeHref: services.game.homeHref,
      title: services.game.title,
      stats: [
        { id: 'score', label: 'Score' },
        { id: 'shields', label: 'Shields' },
        { id: 'streak', label: 'Streak' },
        { id: 'left', label: 'Left' },
      ],
      onSettings: () => this.#openSettings(),
    });

    this.#bannerEl = el('div', { class: 'play__banner pop-in', attrs: { 'aria-hidden': 'true' }, text: '' });
    this.#bannerEl.hidden = true;

    this.#resumeButton = createButton({ label: 'Resume', icon: '▶', variant: 'primary', big: true, onClick: () => this.#setPaused(false) });
    this.#pauseEl = el('div', { class: 'play__pause', attrs: { role: 'dialog', 'aria-label': 'Game paused' } },
      el('h2', { text: 'Paused' }),
      el('p', { text: 'Take a breath. The stars are waiting.' }),
      this.#resumeButton);
    this.#pauseEl.hidden = true;

    const field = el('div', { class: 'play__field' }, this.#bannerEl, this.#pauseEl);

    this.#hintEl = el('p', { class: 'play__hint', attrs: { role: 'status' } });
    this.#hintEl.hidden = true;
    this.#answerEl = el('output', { class: 'answer__text', attrs: { 'aria-live': 'off', 'aria-label': 'Your answer' } });
    this.#feedbackEl = el('span', { class: 'answer__feedback', attrs: { 'aria-hidden': 'true' } });
    const answerRow = el('div', { class: 'answer' }, this.#answerEl, this.#feedbackEl);
    answerRow.addEventListener('animationend', () => answerRow.classList.remove('shake'));
    this.#answerRow = answerRow;

    this.#pad = createNumberPad({
      onDigit: (digit) => this.#typeDigit(digit),
      onBackspace: () => this.#backspace(),
      onEnter: () => this.#submit(),
    });
    this.#panel = el('div', { class: 'play__panel' }, this.#hintEl, answerRow, this.#pad.el);

    this.#announcer = el('div', { class: 'sr-only', attrs: { 'aria-live': 'polite' } });
    // A text mirror of the falling stars for screen-reader users (the canvas itself is hidden from them).
    this.#srList = el('ul', { class: 'sr-only', attrs: { 'aria-label': 'Stars on screen' } });

    this.ui.append(this.#hud.el, field, this.#panel, this.#announcer, this.#srList);
  }

  #renderAnswer() {
    this.#answerEl.textContent = this.#buffer;
  }

  #announce(message) {
    this.#announcer.textContent = message;
  }

  #syncHud() {
    const round = this.#round;
    this.#hud.setStat('score', round.score);
    this.#hud.setStat('streak', round.streak);
    this.#hud.setStat('left', round.total - round.resolved);
    if (round.shields !== this.#shownShields) {
      this.#shownShields = round.shields;
      const wrap = el('span', { attrs: { role: 'img', 'aria-label': `${round.shields} of ${START_SHIELDS} shields` } });
      for (let i = 0; i < START_SHIELDS; i++) {
        wrap.append(el('span', { html: i < round.shields ? ICONS.shield : ICONS.shieldCracked }));
      }
      this.#hud.setStat('shields', wrap);
    }
  }

  #syncSrList() {
    const signature = this.#round.problems.map((p) => p.id).join(',');
    if (signature === this.#srSignature) return;
    this.#srSignature = signature;
    this.#srList.replaceChildren(...this.#round.problems.map((p) => el('li', { text: problemToText(p) })));
  }

  // ---------------------------------------------------------------- input

  #onKey(event) {
    if (this.#done) return;
    if (event.key === 'Escape') {
      this.#setPaused(!this.#paused);
      return;
    }
    if (this.#paused || this.#finishing) return;
    if (/^[0-9]$/.test(event.key)) {
      this.#typeDigit(event.key);
    } else if (event.key === 'Backspace') {
      this.#backspace();
    } else if (event.key === 'Enter' && !event.fromInteractive) {
      // Enter on a focused button is the browser's job (it clicks the button), so ignore it here
      // or one press would act twice.
      this.#submit();
    }
  }

  #typeDigit(digit) {
    if (this.#paused || this.#finishing) return;
    this.#buffer = appendDigit(this.#buffer, digit);
    this.#renderAnswer();
  }

  #backspace() {
    if (this.#paused || this.#finishing) return;
    this.#buffer = backspace(this.#buffer);
    this.#renderAnswer();
  }

  #submit() {
    if (this.#paused || this.#finishing) return;
    const value = parseAnswer(this.#buffer);
    if (value === null) return; // Enter on an empty box does nothing
    const result = this.#round.submit(value);
    this.#buffer = '';
    this.#renderAnswer();

    if (result.type === 'hit') this.#onHit(result);
    else if (result.type === 'wrong') this.#onWrong(result);
    this.#syncHud();
    this.#syncSrList();
    if (this.#round.finished) this.#beginFinish();
  }

  async #openSettings() {
    this.#setPaused(true);
    await this.services.openSettings();
    // Stay paused: the Resume button is the clear way back into the game.
  }

  #setPaused(paused) {
    if (this.#finishing || paused === this.#paused) return;
    this.#paused = paused;
    this.#pauseEl.hidden = !paused;
    this.#pad.setDisabled(paused);
    if (paused) this.#resumeButton.focus();
    this.#announce(paused ? 'Paused' : 'Back in the game');
  }

  // --------------------------------------------------------- game events

  #onHit({ problem, points, milestone, streak }) {
    const { audio } = this.services;
    audio.play('ding');
    const pos = this.#starPos(problem);
    this.#addHitEffects(pos, points);
    this.#showFeedback('✔', false);
    this.#hintTtl = 0;
    this.#hintEl.hidden = true;
    this.#announce(`Correct! Plus ${points} points.`);
    if (milestone) {
      audio.play('streak');
      this.#bannerEl.textContent = `Ninja streak! ${streak} in a row`;
      this.#bannerEl.hidden = false;
      this.#bannerTtl = BANNER_SECONDS;
    }
  }

  #onWrong({ value, hint }) {
    this.services.audio.play('boop');
    // The feedback text carries the message too, so the shake is never the only signal.
    this.#showFeedback(`✖ Not ${value}. Try again!`, true);
    this.#announce(`${value} is not on screen. Try again.`);
    if (hint) {
      this.#hintEl.textContent = `Hint: ${hint}`;
      this.#hintEl.hidden = false;
      this.#hintTtl = HINT_SECONDS;
    }
  }

  #onLanded({ problem }) {
    this.services.audio.play('thud');
    const pos = this.#starPos(problem);
    const text = `${problemToText(problem)} = ${problem.answer}`;
    this.#reveals.push({ text, x: pos.x, y: pos.y + this.#starRadius() + 8 + PLATE_HEIGHT / 2, ttl: REVEAL_SECONDS });
    this.#announce(`A star landed. ${text}. Shields left: ${this.#round.shields}.`);
  }

  #showFeedback(text, shake) {
    this.#feedbackEl.textContent = text;
    this.#feedbackTtl = FEEDBACK_SECONDS;
    if (shake) {
      // Remove and re-add so a second wrong answer shakes again.
      this.#answerRow.classList.remove('shake');
      void this.#answerRow.offsetWidth;
      this.#answerRow.classList.add('shake');
    }
  }

  #beginFinish() {
    if (this.#finishing) return;
    this.#finishing = true;
    this.#endCountdown = END_DELAY[this.#round.endReason] ?? END_DELAY.complete;
  }

  // ---------------------------------------------------------------- loop

  update(dt) {
    if (this.#paused || this.#done) return;
    this.#time += dt;
    this.#tickTransients(dt);

    this.#sinceMeasure += dt;
    if (this.#sinceMeasure > 0.5) this.#measure(); // fonts and wrapping can change panel height

    if (this.#finishing) {
      this.#endCountdown -= dt;
      if (this.#endCountdown <= 0) {
        this.#done = true;
        this.routes.results({ summary: this.#round.results() });
      }
      return;
    }
    if (this.#ready > 0) {
      this.#ready -= dt;
      return;
    }

    for (const event of this.#round.update(dt)) {
      if (event.type === 'spawn') this.services.speech.speak(problemToSpeech(event.problem));
      else if (event.type === 'landed') this.#onLanded(event);
    }
    this.#syncHud();
    this.#syncSrList();
    if (this.#round.finished) this.#beginFinish();
  }

  #tickTransients(dt) {
    for (const f of this.#fx) f.age += dt;
    this.#fx = this.#fx.filter((f) => f.age < f.life);
    for (const r of this.#reveals) r.ttl -= dt;
    this.#reveals = this.#reveals.filter((r) => r.ttl > 0);

    if (this.#feedbackTtl > 0 && (this.#feedbackTtl -= dt) <= 0) this.#feedbackEl.textContent = '';
    if (this.#bannerTtl > 0 && (this.#bannerTtl -= dt) <= 0) this.#bannerEl.hidden = true;
    if (this.#hintTtl > 0 && (this.#hintTtl -= dt) <= 0) this.#hintEl.hidden = true;
  }

  /** Reads the layout: stars fall between the bottom of the HUD and the top of the answer panel. */
  #measure() {
    this.#sinceMeasure = 0;
    if (!this.#hud) return;
    this.#fieldTop = this.#hud.el.offsetHeight;
    this.#groundY = this.#panel.offsetTop || this.#height * 0.6;
  }

  // ------------------------------------------------------------- drawing

  #starRadius() {
    return clamp(this.#width * 0.04, 22, 32);
  }

  /** Centre of a star in pixels. `y` of 0 is the top of the field and 1 is "resting on the ground". */
  #starPos(problem) {
    const r = this.#starRadius();
    const top = this.#fieldTop + r + 8;
    const landed = this.#groundY - 8 - PLATE_HEIGHT - 8 - r;
    return { x: problem.x * this.#width, y: top + problem.y * Math.max(0, landed - top) };
  }

  #addHitEffects(pos, points) {
    this.#fx.push({ kind: 'text', x: pos.x, y: pos.y, age: 0, life: this.#reduced ? 0.9 : 0.9, text: `✔ +${points}` });
    if (this.#reduced) return; // no slicing, sparks or flashes for players who asked for less motion
    this.#fx.push({ kind: 'half', side: -1, x: pos.x, y: pos.y, age: 0, life: 0.55 });
    this.#fx.push({ kind: 'half', side: 1, x: pos.x, y: pos.y, age: 0, life: 0.55 });
    for (let i = 0; i < 10; i++) {
      this.#fx.push({ kind: 'spark', x: pos.x, y: pos.y, angle: (i / 10) * Math.PI * 2, age: 0, life: 0.5 });
    }
  }

  render(ctx) {
    if (!ctx || !this.#width) return;
    this.#drawBackground(ctx);
    for (const star of this.#round.problems) this.#drawFalling(ctx, star);
    for (const reveal of this.#reveals) this.#drawReveal(ctx, reveal);
    for (const fx of this.#fx) this.#drawEffect(ctx, fx);
    if (this.#ready > 0 && !this.#finishing) this.#drawCentreText(ctx, this.#ready > 0.4 ? 'Ready…' : 'Go!');
  }

  #drawBackground(ctx) {
    const w = this.#width;
    const sky = ctx.createLinearGradient(0, 0, 0, this.#groundY);
    sky.addColorStop(0, '#141a4a');
    sky.addColorStop(1, '#4b3fae');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, this.#height);

    ctx.fillStyle = '#ffffff';
    for (const s of this.#skyStars) {
      // A gentle twinkle, skipped for reduced motion.
      ctx.globalAlpha = this.#reduced ? 0.7 : 0.45 + 0.4 * Math.sin(this.#time * 1.5 + s.phase);
      ctx.beginPath();
      ctx.arc(s.x * w, this.#fieldTop + s.y * (this.#groundY - this.#fieldTop), s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Moon: dim, so a falling star passing in front of it still stands out.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(w - 70, this.#fieldTop + 56, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Dojo floor
    ctx.fillStyle = '#2c6e49';
    ctx.fillRect(0, this.#groundY - 14, w, 14);
    ctx.fillStyle = INK;
    ctx.fillRect(0, this.#groundY - 14, w, 3);
  }

  #drawFalling(ctx, problem) {
    const r = this.#starRadius();
    const { x, y } = this.#starPos(problem);
    const wobble = this.#reduced ? 0 : Math.sin(this.#time * 2.2 + problem.id) * 0.08;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(wobble);
    starPath(ctx, r, r * 0.5);
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();

    this.#drawPlate(ctx, x, y + r + 8 + PLATE_HEIGHT / 2, problemToText(problem), { urgent: problem.y >= URGENT_FROM });
  }

  /** The label under a star: white plate, dark text, 32 px (smaller only if the lane is narrow). */
  #drawPlate(ctx, cx, cy, text, { urgent = false, bad = false } = {}) {
    const maxWidth = this.#width / this.#lanes - 8;
    let size = 32;
    ctx.font = `700 ${size}px ${FONT}`;
    while (size > 20 && ctx.measureText(text).width + 28 > Math.max(maxWidth, 120)) {
      size -= 2;
      ctx.font = `700 ${size}px ${FONT}`;
    }
    const w = ctx.measureText(text).width + 28;
    const x = clamp(cx, w / 2 + 4, this.#width - w / 2 - 4);

    ctx.beginPath();
    ctx.roundRect(x - w / 2, cy - PLATE_HEIGHT / 2, w, PLATE_HEIGHT, 14);
    ctx.fillStyle = bad ? '#fde8e6' : '#ffffff';
    ctx.fill();
    ctx.lineWidth = urgent || bad ? 4 : 3;
    ctx.strokeStyle = urgent || bad ? '#b3261e' : INK;
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, cy + 1);

    if (urgent) {
      // Warning badge: a shape and a "!" so the warning does not depend on the red outline.
      ctx.beginPath();
      ctx.arc(x + w / 2 - 2, cy - PLATE_HEIGHT / 2, 13, 0, Math.PI * 2);
      ctx.fillStyle = '#b3261e';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = `800 18px ${FONT}`;
      ctx.fillText('!', x + w / 2 - 2, cy - PLATE_HEIGHT / 2 + 1);
    }
  }

  #drawReveal(ctx, reveal) {
    // Fade out over the last 0.3 s so the answer does not blink away.
    ctx.globalAlpha = clamp(reveal.ttl / 0.3, 0, 1);
    this.#drawPlate(ctx, reveal.x, reveal.y, `✖ ${reveal.text}`, { bad: true });
    ctx.globalAlpha = 1;
  }

  #drawEffect(ctx, fx) {
    const t = fx.age / fx.life;
    const r = this.#starRadius();
    ctx.save();
    if (fx.kind === 'half') {
      ctx.globalAlpha = 1 - t;
      ctx.translate(fx.x + fx.side * 70 * t, fx.y + 120 * t * t);
      ctx.rotate(fx.side * t * 1.4);
      ctx.beginPath();
      ctx.rect(fx.side < 0 ? -r - 4 : 0, -r - 4, r + 4, 2 * r + 8);
      ctx.clip();
      starPath(ctx, r, r * 0.5);
      ctx.fillStyle = '#ffd23f';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = INK;
      ctx.stroke();
    } else if (fx.kind === 'spark') {
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(fx.x + Math.cos(fx.angle) * 80 * t, fx.y + Math.sin(fx.angle) * 80 * t, 5 * (1 - t) + 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (fx.kind === 'text') {
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `800 32px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      const y = fx.y - (this.#reduced ? 0 : 60 * t);
      ctx.strokeText(fx.text, fx.x, y);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(fx.text, fx.x, y);
    }
    ctx.restore();
  }

  #drawCentreText(ctx, text) {
    ctx.font = `800 64px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    const y = this.#fieldTop + (this.#groundY - this.#fieldTop) / 2;
    ctx.strokeText(text, this.#width / 2, y);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, this.#width / 2, y);
  }
}
