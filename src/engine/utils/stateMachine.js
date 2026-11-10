import { GameError } from './errors.js';

/**
 * A tiny finite-state machine: a declared table of states and the events that move between them.
 *
 * Why it exists: screens and rules used to keep their state in loose booleans (`#paused`, `#finishing`, `#done`) and in
 * strings assigned from many places. Nothing said which combinations were legal, so a missed `if` could leave a game
 * stuck. A machine states the legal moves once, in data, so that tooling (tests, diagrams, agents) can read it.
 *
 * Two ways to send an event, on purpose:
 * - `send(event)` is for input that may arrive at the wrong time (a tap during a lock). It returns `false` when the
 *   current state does not accept the event, and the caller ignores the input.
 * - `must(event)` is for moves that the code itself guarantees. It throws, so a broken assumption is loud.
 *
 * @typedef {{
 *   on?: Readonly<Record<string, string>>,
 *   tags?: readonly string[],
 *   final?: boolean
 * }} StateConfig `on` maps an event name to the state it leads to. `tags` name what the state allows
 *   (for example `pausable`), so callers ask `hasTag('pausable')` instead of listing state names. `final` marks a
 *   state the machine is meant to stay in.
 * @typedef {{ id: string, initial: string, states: Readonly<Record<string, StateConfig>> }} MachineDefinition
 * @typedef {{ from: string, event: string, to: string }} Transition
 */

/**
 * Checks a machine definition and returns it frozen.
 * @param {MachineDefinition} definition
 * @returns {Readonly<MachineDefinition>}
 * @throws {GameError} 'BAD_MACHINE' when the id is missing, the initial state is unknown, a transition leads to an unknown
 *   state, or `tags` is not a list of strings.
 */
export function defineMachine(definition) {
  const { id, initial, states } = definition;
  const fail = (problem) => {
    throw new GameError('BAD_MACHINE', `Machine "${id ?? '?'}": ${problem}`, { machine: id });
  };
  if (typeof id !== 'string' || id === '') fail('needs an id');
  if (!states || typeof states !== 'object' || Object.keys(states).length === 0) fail('needs at least one state');
  if (!Object.hasOwn(states, initial)) fail(`initial state "${initial}" is not declared`);
  for (const [name, config] of Object.entries(states)) {
    for (const [event, target] of Object.entries(config.on ?? {})) {
      if (!Object.hasOwn(states, target)) fail(`"${name}" on "${event}" leads to unknown state "${target}"`);
    }
    if (config.tags && !(Array.isArray(config.tags) && config.tags.every((t) => typeof t === 'string'))) {
      fail(`"${name}" tags must be a list of strings`);
    }
  }
  const frozenStates = Object.fromEntries(Object.entries(states).map(([name, config]) => [name, Object.freeze({
    on: Object.freeze({ ...(config.on ?? {}) }),
    tags: Object.freeze([...(config.tags ?? [])]),
    final: config.final === true,
  })]));
  return Object.freeze({ id, initial, states: Object.freeze(frozenStates) });
}

/**
 * Lists every move in a definition, in the order it was written.
 * @param {MachineDefinition} definition
 * @returns {Transition[]}
 */
export function transitionsOf(definition) {
  return Object.entries(definition.states).flatMap(([from, config]) =>
    Object.entries(config.on ?? {}).map(([event, to]) => ({ from, event, to })));
}

/**
 * Finds design mistakes that a definition can have even though it is well formed: a state nothing leads to, a state the
 * machine can never leave although it is not marked `final`, and a `final` state that has a way out.
 * @param {MachineDefinition} definition
 * @returns {string[]} One sentence per problem; empty when the definition is sound.
 */
export function lintMachine(definition) {
  const problems = [];
  const { id, initial, states } = definition;
  const reached = new Set([initial]);
  const queue = [initial];
  while (queue.length) {
    for (const target of Object.values(states[queue.pop()].on ?? {})) {
      if (!reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  }
  for (const [name, config] of Object.entries(states)) {
    const exits = Object.keys(config.on ?? {}).length;
    if (!reached.has(name)) problems.push(`${id}: state "${name}" can never be reached`);
    if (exits === 0 && !config.final) problems.push(`${id}: state "${name}" has no way out and is not marked final`);
    if (exits > 0 && config.final) problems.push(`${id}: final state "${name}" still has transitions`);
  }
  return problems;
}

/**
 * A plain, serialisable summary of a machine, for logs, docs and tools.
 * @param {MachineDefinition} definition
 * @returns {{
 *   id: string, initial: string,
 *   states: { name: string, tags: string[], final: boolean }[], transitions: Transition[]
 * }}
 */
export function describeMachine(definition) {
  return {
    id: definition.id,
    initial: definition.initial,
    states: Object.entries(definition.states).map(([name, c]) => ({ name, tags: [...(c.tags ?? [])], final: c.final === true })),
    transitions: transitionsOf(definition),
  };
}

/**
 * Draws a machine as a Mermaid `stateDiagram-v2` (GitHub and most Markdown viewers render it).
 * The output is deterministic, so a test can compare it with the copy in the docs.
 * @param {MachineDefinition} definition
 * @returns {string}
 */
export function toMermaid(definition) {
  const lines = ['stateDiagram-v2', `  [*] --> ${definition.initial}`];
  for (const { from, event, to } of transitionsOf(definition)) lines.push(`  ${from} --> ${to}: ${event}`);
  for (const [name, config] of Object.entries(definition.states)) if (config.final) lines.push(`  ${name} --> [*]`);
  return lines.join('\n');
}

/**
 * A running machine. It holds only the current state: the rules stay in the definition.
 */
export class Machine {
  #definition;
  #state;
  #listeners = new Set();
  #events;

  /** @param {MachineDefinition} definition Must come from {@link defineMachine}. */
  constructor(definition) {
    this.#definition = definition;
    this.#state = definition.initial;
    this.#events = new Set(transitionsOf(definition).map((t) => t.event));
  }

  /** @returns {string} The current state. */
  get state() {
    return this.#state;
  }

  /** @returns {MachineDefinition} */
  get definition() {
    return this.#definition;
  }

  /**
   * @param {...string} names
   * @returns {boolean} True when the machine is in any of the named states.
   * @throws {GameError} 'UNKNOWN_STATE' for a name the definition does not declare (a typo would otherwise be silently false).
   */
  is(...names) {
    for (const name of names) this.#assertState(name);
    return names.includes(this.#state);
  }

  /** @param {string} tag @returns {boolean} True when the current state carries the tag. */
  hasTag(tag) {
    return this.#definition.states[this.#state].tags.includes(tag);
  }

  /**
   * @param {string} event
   * @returns {boolean} True when the current state accepts the event.
   * @throws {GameError} 'UNKNOWN_EVENT' for an event no state declares.
   */
  can(event) {
    this.#assertEvent(event);
    return Object.hasOwn(this.#definition.states[this.#state].on, event);
  }

  /**
   * Moves if the current state accepts the event; otherwise does nothing and says so.
   * @param {string} event
   * @returns {boolean} True when the machine moved.
   * @throws {GameError} 'UNKNOWN_EVENT' for an event no state declares: that is a typo, never "input at the wrong time".
   */
  send(event) {
    if (!this.can(event)) return false;
    const from = this.#state;
    const to = this.#definition.states[from].on[event];
    this.#state = to;
    for (const listener of [...this.#listeners]) listener({ machine: this.#definition.id, from, event, to });
    return true;
  }

  /**
   * Like {@link Machine#send}, but a refused event is a bug.
   * @param {string} event
   * @throws {GameError} 'ILLEGAL_TRANSITION' when the current state does not accept the event.
   */
  must(event) {
    if (!this.send(event)) {
      throw new GameError('ILLEGAL_TRANSITION', `Machine "${this.#definition.id}": "${event}" is not allowed in state "${this.#state}"`, {
        machine: this.#definition.id, state: this.#state, event,
      });
    }
  }

  /**
   * Calls `listener` after every move. Handy for logging while debugging.
   * @param {(change: { machine: string, from: string, event: string, to: string }) => void} listener
   * @returns {() => void} Unsubscribe.
   */
  subscribe(listener) {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #assertState(name) {
    if (!Object.hasOwn(this.#definition.states, name)) {
      throw new GameError('UNKNOWN_STATE', `Machine "${this.#definition.id}" has no state "${name}"`, { machine: this.#definition.id, state: name });
    }
  }

  #assertEvent(event) {
    if (!this.#events.has(event)) {
      throw new GameError('UNKNOWN_EVENT', `Machine "${this.#definition.id}" has no event "${event}"`, { machine: this.#definition.id, event });
    }
  }
}

/**
 * Starts a machine in its initial state.
 * @param {MachineDefinition} definition
 * @returns {Machine}
 */
export function createMachine(definition) {
  return new Machine(definition);
}
