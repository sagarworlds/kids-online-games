/**
 * @typedef {{ id: string, label: string, color: string, icon: string }} Topping
 * Each topping is also drawn with its own *shape* (see the pizza canvas), so it never depends on colour alone.
 */

/** @type {readonly Topping[]} */
export const TOPPINGS = Object.freeze([
  { id: 'pepperoni', label: 'Pepperoni', color: '#c62828', icon: '🔴' },
  { id: 'olive', label: 'Olive', color: '#2f3b2f', icon: '⚫' },
  { id: 'mushroom', label: 'Mushroom', color: '#c8a27a', icon: '🍄' },
  { id: 'cheese', label: 'Cheese', color: '#f4c430', icon: '🧀' },
].map(Object.freeze));

/** @param {string} id @returns {Topping} */
export const toppingById = (id) => TOPPINGS.find((t) => t.id === id);
