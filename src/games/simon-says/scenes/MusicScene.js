import { SimonScene } from './SimonScene.js';
import { el } from '../../../engine/utils/dom.js';
import { sleep } from '../../../engine/utils/timer.js';
import { createButton, setDisabled } from '../../../engine/ui/Button.js';
import { createHud } from '../../../engine/ui/Hud.js';
import { getLevel } from '../logic/levels.js';
import { padsFor, PADS } from '../logic/pads.js';
import { playSequence } from '../logic/sequencePlayer.js';
import { Recorder, MAX_NOTES } from '../logic/recorder.js';
import { createPadBoard } from '../ui/PadBoard.js';

const NOTE_MS = 350;
const GAP_MS = 120;
const FLASH_SECONDS = 0.2;

/** Music Maker: tap the pads to compose, keep up to 16 notes, play them back. There is no score. */
export class MusicScene extends SimonScene {
  #level = null;
  #pads = null;
  #recorder = new Recorder();
  #slots = null;
  #statusEl = null;
  #buttons = {};
  #abort = new AbortController();
  #flash = new Map();
  #offs = [];
  #playing = false;

  /** @param {{ levelId: 'easy'|'medium'|'hard' }} params */
  enter({ levelId }) {
    const { services } = this;
    this.#level = getLevel(levelId);
    const hud = createHud({ homeHref: services.game.homeHref, title: `${services.game.title}: Music Maker`, onSettings: () => services.openSettings() });
    this.#pads = createPadBoard({ pads: padsFor(this.#level.pads), onPress: (id) => this.#tap(id) });
    this.#pads.setEnabled(true);
    this.#slots = el('ol', { class: 'music__slots', attrs: { 'aria-label': 'Recorded notes' } });
    this.#statusEl = el('p', { class: 'simon__status', attrs: { role: 'status' } });
    this.#buttons.play = createButton({ label: 'Play back', icon: '▶', variant: 'primary', onClick: () => this.#playBack() });
    this.#buttons.clear = createButton({ label: 'Clear', icon: '🗑', onClick: () => { this.#recorder.clear(); this.#render(); } });
    this.#buttons.menu = createButton({ label: 'Menu', onClick: () => this.routes.menu() });

    this.ui.append(hud.el, el('main', { class: 'simon' },
      el('div', { class: 'simon__display' }, el('p', { class: 'simon__length', text: 'Make some music' }), this.#statusEl),
      this.#pads.el, this.#slots,
      el('div', { class: 'simon__controls' }, this.#buttons.play, this.#buttons.clear, this.#buttons.menu),
      el('p', { class: 'simon__note', text: `Tap the pads (or keys 1-${this.#level.pads}). Up to ${MAX_NOTES} notes are saved. No score here: just play.` })));

    this.#offs.push(services.input.on('key', (event) => {
      const pad = padsFor(this.#level.pads).find((p) => p.key === event.key);
      if (pad) this.#tap(pad.id);
    }));
    this.#render();
  }

  exit() {
    this.#abort.abort();
    for (const off of this.#offs) off();
    this.#offs = [];
  }

  #tap(padId) {
    if (this.#playing) return; // taps are ignored during playback, not queued
    this.services.audio.playTone(PADS[padId].freqHz, 260);
    this.#pads.light(padId, true);
    this.#flash.set(padId, FLASH_SECONDS);
    if (!this.#recorder.add(padId)) this.#statusEl.textContent = `That is ${MAX_NOTES} notes. Press Clear to start again.`;
    this.#render();
  }

  async #playBack() {
    if (this.#playing || this.#recorder.notes.length === 0) return;
    this.#playing = true;
    this.#pads.setEnabled(false);
    this.#render();
    this.#statusEl.textContent = 'Playing…';
    try {
      await playSequence({
        sequence: this.#recorder.notes, noteMs: NOTE_MS, gapMs: GAP_MS, signal: this.#abort.signal, sleep,
        light: (id, on) => this.#pads.light(id, on),
        tone: (id, ms) => this.services.audio.playTone(PADS[id].freqHz, ms),
      });
    } finally {
      this.#playing = false;
      if (!this.#abort.signal.aborted) {
        this.#pads.setEnabled(true);
        this.#statusEl.textContent = '';
        this.#render();
      }
    }
  }

  update(dt) {
    for (const [padId, left] of this.#flash) {
      if (left - dt <= 0) { this.#flash.delete(padId); this.#pads.light(padId, false); } else this.#flash.set(padId, left - dt);
    }
  }

  #render() {
    const notes = this.#recorder.notes;
    this.#slots.replaceChildren(...Array.from({ length: MAX_NOTES }, (_, i) => {
      const pad = notes[i] === undefined ? null : PADS[notes[i]];
      return el('li', { class: `slot${pad ? ' is-filled' : ''}`, text: pad ? pad.key : '', style: pad ? { '--pad': pad.color } : {},
        attrs: { 'aria-label': pad ? `Note ${i + 1}: ${pad.name}` : `Note ${i + 1}: empty` } });
    }));
    setDisabled(this.#buttons.play, this.#playing || notes.length === 0);
    setDisabled(this.#buttons.clear, this.#playing || notes.length === 0);
  }
}
