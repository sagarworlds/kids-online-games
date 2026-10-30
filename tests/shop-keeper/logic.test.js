import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sum, minPieces, minBreakdown, checkChange } from '../../src/games/shop-keeper/logic/change.js';
import { validateCurrency, formatMoney, noteValues, findDenomination } from '../../src/games/shop-keeper/logic/currency.js';
import { validateItems, itemsAtPrice } from '../../src/games/shop-keeper/logic/items.js';
import { generateSale, generateRound, paymentOptions, splitTotal } from '../../src/games/shop-keeper/logic/saleGenerator.js';
import { startCustomer, submitTotal, submitChange, submitNoChange, statusOf } from '../../src/games/shop-keeper/logic/customer.js';
import { changeMessage, totalMessage } from '../../src/games/shop-keeper/logic/messages.js';
import { roundStars, saleScore, SMART_STAR_THRESHOLD } from '../../src/games/shop-keeper/logic/scoring.js';
import { LEVELS, LEVEL_IDS, getLevel, MAX_CHANGE_RETRIES } from '../../src/games/shop-keeper/logic/levels.js';
import { createRng } from '../../src/engine/utils/random.js';

/** Matches the GameError an invalid data file raises for one field (the error also carries the file name). */
const onField = (field) => (error) => error.code === 'INVALID_DATA' && error.context.field === field;
const read = (name) => JSON.parse(readFileSync(new URL(`../../src/games/shop-keeper/data/${name}`, import.meta.url), 'utf8'));
const inr = validateCurrency(read('currency.inr.json'));
const items = validateItems(read('items.json'));
const data = { currency: inr, items };

// ---- minimum pieces ---------------------------------------------------------------

/** Independent check: breadth-first search over amounts, so it shares no code with the dynamic-programming version. */
function bfsMin(amount, values) {
  const dist = new Map([[0, 0]]);
  let frontier = [0];
  while (frontier.length && !dist.has(amount)) {
    const next = [];
    for (const a of frontier) for (const v of values) {
      const b = a + v;
      if (b <= amount && !dist.has(b)) { dist.set(b, dist.get(a) + 1); next.push(b); }
    }
    frontier = next;
  }
  return dist.get(amount) ?? null;
}

test('minPieces is the true minimum for every amount from 1 to 999 (rupees)', () => {
  const values = [...new Set(inr.denominations.map((d) => d.value))];
  for (let amount = 1; amount <= 999; amount++) {
    assert.equal(minPieces(amount, inr.denominations), bfsMin(amount, values), `amount ${amount}`);
  }
});

test('for rupees the minimum agrees with the greedy "largest piece first" method', () => {
  const values = [500, 200, 100, 50, 20, 10, 5, 2, 1];
  for (let amount = 1; amount <= 999; amount++) {
    let left = amount;
    let count = 0;
    for (const v of values) { count += Math.floor(left / v); left %= v; }
    assert.equal(minPieces(amount, inr.denominations), count, `amount ${amount}`);
  }
});

test('minPieces is exact where greedy is wrong, so any currency file works', () => {
  const odd = [{ value: 1 }, { value: 3 }, { value: 4 }];
  assert.equal(minPieces(6, odd), 2, '3 + 3, where greedy would use 4 + 1 + 1');
  for (let amount = 1; amount <= 60; amount++) assert.equal(minPieces(amount, odd), bfsMin(amount, [1, 3, 4]));
});

test('minBreakdown lists pieces that add up to the amount, largest first, using only real denominations', () => {
  for (const amount of [1, 7, 38, 99, 137, 640, 999]) {
    const pieces = minBreakdown(amount, inr.denominations);
    assert.equal(sum(pieces), amount);
    assert.deepEqual(pieces, [...pieces].sort((a, b) => b - a));
    assert.ok(pieces.every((p) => inr.denominations.some((d) => d.value === p)));
  }
  assert.deepEqual(minBreakdown(0, inr.denominations), []);
  assert.deepEqual(minBreakdown(38, inr.denominations), [20, 10, 5, 2, 1]);
});

test('amounts that cannot be made give null, and bad amounts throw', () => {
  assert.equal(minPieces(7, [{ value: 5 }]), null);
  assert.throws(() => minBreakdown(-1, inr.denominations), { code: 'BAD_MONEY' });
  assert.throws(() => minBreakdown(2.5, inr.denominations), { code: 'BAD_MONEY' });
  assert.throws(() => sum([1, 2.5]), { code: 'BAD_MONEY' });
});

// ---- checking change --------------------------------------------------------------

const sale = { items: [{ name: 'Kite', icon: '🪁', price: 62 }], total: 62, paid: [100], paidTotal: 100, changeDue: 38 };

test('change is right when the tray equals payment minus bill, however it is made', () => {
  assert.equal(checkChange(sale, [20, 10, 5, 2, 1], inr.denominations).kind, 'exact');
  assert.equal(checkChange(sale, [10, 10, 10, 5, 2, 1], inr.denominations).kind, 'exact');
  assert.equal(checkChange(sale, Array(38).fill(1), inr.denominations).kind, 'exact');
});

test('smart change is exact change in the fewest pieces', () => {
  assert.equal(checkChange(sale, [20, 10, 5, 2, 1], inr.denominations).smart, true);
  assert.equal(checkChange(sale, [10, 10, 10, 5, 2, 1], inr.denominations).smart, false);
  assert.equal(checkChange(sale, [20, 10, 5, 2, 1], inr.denominations).fewest, 5);
});

test('too much and too little report the exact difference', () => {
  const much = checkChange(sale, [20, 10, 5, 2, 2], inr.denominations);
  assert.deepEqual([much.kind, much.diff], ['tooMuch', 1]);
  const little = checkChange(sale, [20, 10, 5], inr.denominations);
  assert.deepEqual([little.kind, little.diff], ['tooLittle', 3]);
  assert.equal(little.smart, false, 'wrong change is never smart');
});

test('an empty tray is its own answer, even when nothing is due', () => {
  assert.equal(checkChange(sale, [], inr.denominations).kind, 'empty');
  assert.equal(checkChange({ ...sale, changeDue: 0 }, [], inr.denominations).kind, 'empty');
  assert.equal(checkChange({ ...sale, changeDue: 0 }, [5], inr.denominations).kind, 'tooMuch');
});

// ---- currency data ----------------------------------------------------------------

test('the rupee file loads, and formatMoney uses its symbol with whole numbers', () => {
  assert.equal(inr.code, 'INR');
  assert.equal(formatMoney(50, inr), '₹50');
  assert.deepEqual(noteValues(inr), [10, 20, 50, 100, 200, 500]);
  assert.equal(findDenomination(inr, 10, 'note').kind, 'note');
  assert.equal(findDenomination(inr, 10, 'coin').kind, 'coin');
  assert.equal(findDenomination(inr, 7), undefined);
});

test('currency validation names the field that is wrong', () => {
  const good = read('currency.inr.json');
  const bad = (change) => () => { const copy = structuredClone(good); change(copy); validateCurrency(copy); };
  assert.throws(bad((c) => { delete c.symbol; }), onField('symbol'));
  assert.throws(bad((c) => { c.denominations = []; }), onField('denominations'));
  assert.throws(bad((c) => { c.denominations[2].value = 2.5; }), onField('denominations[2].value'));
  assert.throws(bad((c) => { c.denominations[0].kind = 'cheque'; }), onField('denominations[0].kind'));
  assert.throws(bad((c) => { c.denominations[0].color = 'silver'; }), onField('denominations[0].color'));
  assert.throws(bad((c) => { c.denominations.push({ ...c.denominations[0] }); }), /listed twice/);
  assert.throws(bad((c) => { c.denominations = c.denominations.filter((d) => d.value !== 1); }), /denomination of 1/);
  assert.throws(bad((c) => { c.denominations = c.denominations.filter((d) => d.kind === 'coin'); }), /at least one note/);
});

/** A different currency, built only from data: dollars with cents turned into whole dollars. */
const usd = validateCurrency({
  code: 'USD', symbol: '$', name: 'US Dollar',
  denominations: [
    { value: 1, kind: 'coin', label: '1 dollar coin', color: '#ddd' },
    { value: 1, kind: 'note', label: '1 dollar note', color: '#cfc' },
    { value: 5, kind: 'note', label: '5 dollar note', color: '#cfc' },
    { value: 10, kind: 'note', label: '10 dollar note', color: '#cfc' },
    { value: 20, kind: 'note', label: '20 dollar note', color: '#cfc' },
    { value: 50, kind: 'note', label: '50 dollar note', color: '#cfc' },
    { value: 100, kind: 'note', label: '100 dollar note', color: '#cfc' },
  ],
});

test('swapping the currency data changes the money with no code changes', () => {
  assert.equal(formatMoney(50, usd), '$50');
  const rng = createRng(4);
  for (const levelId of LEVEL_IDS) {
    for (let i = 0; i < 100; i++) {
      const s = generateSale(levelId, rng, { currency: usd, items });
      assert.ok(s.paid.every((p) => noteValues(usd).includes(p)), `${levelId}: paid with dollar notes only`);
      assert.equal(s.paidTotal - s.total, s.changeDue);
    }
  }
  const msg = changeMessage({ kind: 'tooMuch', diff: 5 }, usd, LEVELS.easy);
  assert.equal(msg, 'You gave $5 too much.');
});

// ---- items ------------------------------------------------------------------------

test('there are over 30 items and every price from 1 to 450 has at least three to choose from', () => {
  assert.ok(items.length >= 30);
  for (let price = 1; price <= 450; price++) assert.ok(itemsAtPrice(items, price).length >= 3, `price ${price}`);
});

test('item validation catches gaps and bad entries', () => {
  const good = read('items.json');
  const bad = (change) => () => { const copy = structuredClone(good); change(copy); validateItems(copy); };
  assert.throws(bad((d) => { d.items = []; }), { code: 'INVALID_DATA' });
  assert.throws(bad((d) => { d.items[0].min = 0; }), onField('items[0].min'));
  assert.throws(bad((d) => { d.items[1].max = 0; }), onField('items[1].max'));
  assert.throws(bad((d) => { d.items[2].name = d.items[3].name; }), /appears twice/);
  assert.throws(bad((d) => { d.items = d.items.filter((i) => i.max < 300); }), /needs at least 3 items that can cost/);
});

// ---- sale generator ---------------------------------------------------------------

test('every sale is complete: bill, notes, and change that can be made', () => {
  for (const levelId of LEVEL_IDS) {
    const level = getLevel(levelId);
    const rng = createRng(2024);
    for (let i = 0; i < 600; i++) {
      const s = generateSale(levelId, rng, data);
      assert.equal(s.items.length, level.items, `${levelId}: item count`);
      for (const item of s.items) {
        assert.ok(item.price >= level.priceMin && item.price <= level.priceMax, `${levelId}: price ${item.price}`);
        assert.ok(Number.isInteger(item.price));
        assert.ok(itemsAtPrice(items, item.price).some((it) => it.name === item.name), 'the item can cost that');
      }
      assert.equal(s.total, sum(s.items.map((it) => it.price)));
      assert.ok(s.total <= level.maxTotal);
      assert.ok(s.paid.length >= 1 && s.paid.length <= level.maxPaymentNotes, `${levelId}: ${s.paid.length} notes`);
      assert.ok(s.paid.every((p) => noteValues(inr).includes(p)));
      assert.equal(s.paidTotal, sum(s.paid));
      assert.ok(s.paidTotal >= s.total);
      assert.equal(s.changeDue, s.paidTotal - s.total);
      assert.notEqual(minPieces(s.changeDue, inr.denominations), null, 'the change can be made');
    }
  }
});

test('Easy: the customer pays with the next note up (10, 20, 50 or 100) and change is always due', () => {
  const rng = createRng(5);
  for (let i = 0; i < 300; i++) {
    const s = generateSale('easy', rng, data);
    assert.equal(s.paid.length, 1);
    const note = s.paid[0];
    assert.ok([10, 20, 50, 100].includes(note));
    assert.ok(note > s.total);
    assert.ok([10, 20, 50, 100].filter((n) => n > s.total)[0] === note, `${note} is the smallest note above ${s.total}`);
    assert.ok(s.changeDue >= 1);
  }
});

test('Medium: one note, larger than the total, so change is always due', () => {
  const rng = createRng(6);
  for (let i = 0; i < 300; i++) {
    const s = generateSale('medium', rng, data);
    assert.equal(s.paid.length, 1);
    assert.ok(s.paid[0] > s.total);
    assert.ok(s.changeDue >= 1);
  }
});

test('Hard: sometimes two notes, sometimes an exact payment (no change), never on the easier levels', () => {
  const rng = createRng(7);
  let exact = 0;
  let twoNotes = 0;
  const N = 1000;
  for (let i = 0; i < N; i++) {
    const s = generateSale('hard', rng, data);
    if (s.changeDue === 0) exact += 1;
    if (s.paid.length === 2) twoNotes += 1;
  }
  assert.ok(exact > N * 0.12 && exact < N * 0.3, `exact payments ${exact}/${N}`);
  assert.ok(twoNotes > N * 0.2, `two-note payments ${twoNotes}/${N}`);
  for (const levelId of ['easy', 'medium']) {
    const r = createRng(8);
    for (let i = 0; i < 300; i++) assert.ok(generateSale(levelId, r, data).changeDue > 0);
  }
});

test('items within one sale are different where the list allows it', () => {
  const rng = createRng(9);
  let duplicates = 0;
  for (let i = 0; i < 300; i++) {
    const names = generateSale('hard', rng, data).items.map((it) => it.name);
    if (new Set(names).size < names.length) duplicates += 1;
  }
  assert.equal(duplicates, 0);
});

test('splitTotal splits into parts that stay in range, and refuses impossible totals', () => {
  const rng = createRng(1);
  for (let i = 0; i < 500; i++) {
    const total = 30 + (i % 1300);
    const parts = splitTotal(total, 3, 10, 450, rng);
    assert.ok(parts, `total ${total}`);
    assert.equal(sum(parts), total);
    assert.ok(parts.every((p) => p >= 10 && p <= 450));
  }
  assert.equal(splitTotal(29, 3, 10, 450, rng), null);
  assert.equal(splitTotal(1351, 3, 10, 450, rng), null);
});

test('paymentOptions lists each amount once, smallest first, using the fewest notes', () => {
  const options = paymentOptions([10, 20, 50, 100, 200, 500], 2);
  const sums = options.map((o) => o.sum);
  assert.deepEqual(sums, [...new Set(sums)].sort((a, b) => a - b));
  assert.deepEqual(options.find((o) => o.sum === 200).notes, [200], 'one note, not 100 + 100');
  assert.deepEqual(options.find((o) => o.sum === 600).notes, [100, 500]);
  assert.equal(options.find((o) => o.sum === 1000).notes.length, 2);
  assert.equal(paymentOptions([10, 20], 1).length, 2);
});

test('generation is reproducible from a seed, and rounds have the requested size', () => {
  assert.deepEqual(generateRound('hard', 6, createRng(42), data), generateRound('hard', 6, createRng(42), data));
  assert.equal(generateRound('medium', 6, createRng(1), data).length, 6);
  assert.throws(() => generateRound('easy', 0, createRng(1), data), { code: 'BAD_COUNT' });
  assert.throws(() => generateSale('nope', createRng(1), data), { code: 'UNKNOWN_LEVEL' });
});

test('a currency that cannot make a sale fails with a clear error instead of looping forever', () => {
  const tiny = validateCurrency({ code: 'XXX', symbol: 'x', name: 'Tiny', denominations: [{ value: 1, kind: 'coin', label: 'c', color: '#fff' }, { value: 5, kind: 'note', label: 'n', color: '#fff' }] });
  assert.throws(() => generateSale('hard', createRng(1), { currency: tiny, items }), { code: 'SALE_GENERATION_FAILED' });
});

// ---- the customer's sale ----------------------------------------------------------

test('Easy starts at the change step; Medium and Hard start by adding up the total', () => {
  assert.equal(startCustomer(sale, LEVELS.easy).phase, 'change');
  assert.equal(startCustomer(sale, LEVELS.medium).phase, 'total');
  assert.equal(startCustomer(sale, LEVELS.hard).phase, 'total');
});

test('typing the right total moves on to the change; a non-number costs nothing', () => {
  const c = startCustomer(sale, LEVELS.medium);
  for (const text of ['', ' ', 'abc', '6 2', '-62', '62.5', '1e3']) assert.equal(submitTotal(c, text).kind, 'invalid', JSON.stringify(text));
  assert.equal(submitTotal(c, 'abc').customer.totalWrong, 0);
  const ok = submitTotal(c, ' 62 ');
  assert.equal(ok.kind, 'correct');
  assert.equal(ok.customer.phase, 'change');
  assert.equal(submitTotal(c, 62).kind, 'correct', 'numbers work too');
});

test('three wrong totals reveal the total and move on, counting as mistakes', () => {
  let c = startCustomer(sale, LEVELS.medium);
  const first = submitTotal(c, '60');
  assert.deepEqual([first.kind, first.wrongCount], ['wrong', 1]);
  c = first.customer;
  const second = submitTotal(c, '61');
  assert.deepEqual([second.kind, second.wrongCount], ['wrong', 2]);
  const third = submitTotal(second.customer, '63');
  assert.equal(third.kind, 'revealed');
  assert.equal(third.customer.phase, 'change');
  assert.equal(statusOf(third.customer), 'retry');
});

test('the steps must happen in order', () => {
  const c = startCustomer(sale, LEVELS.medium);
  assert.throws(() => submitChange(c, [1], inr.denominations), { code: 'WRONG_PHASE' });
  assert.throws(() => submitNoChange(c), { code: 'WRONG_PHASE' });
  assert.throws(() => submitTotal(startCustomer(sale, LEVELS.easy), '62'), { code: 'WRONG_PHASE' });
});

test('exact change first time is first, and notes when it was the fewest pieces', () => {
  const r = submitChange(startCustomer(sale, LEVELS.easy), [20, 10, 5, 2, 1], inr.denominations);
  assert.equal(r.kind, 'exact');
  assert.equal(r.customer.smart, true);
  assert.equal(r.customer.phase, 'done');
  assert.equal(statusOf(r.customer), 'first');
  const slow = submitChange(startCustomer(sale, LEVELS.easy), Array(38).fill(1), inr.denominations);
  assert.equal(slow.customer.smart, false);
  assert.equal(statusOf(slow.customer), 'first', 'right first time even if not smart');
});

test('an empty tray is not a mistake', () => {
  const c = startCustomer(sale, LEVELS.easy);
  const r = submitChange(c, [], inr.denominations);
  assert.equal(r.kind, 'empty');
  assert.equal(r.customer.changeWrong, 0);
});

test('wrong change can be retried twice, then the answer is shown', () => {
  let c = startCustomer(sale, LEVELS.easy);
  const kinds = [];
  for (let i = 0; i < MAX_CHANGE_RETRIES + 1; i++) {
    const r = submitChange(c, [20], inr.denominations);
    kinds.push(r.kind);
    c = r.customer;
  }
  assert.deepEqual(kinds, ['tooLittle', 'tooLittle', 'failed']);
  assert.equal(c.phase, 'done');
  assert.equal(statusOf(c), 'failed');
});

test('right after a mistake is retry, and a customer is never changed in place', () => {
  const c = startCustomer(sale, LEVELS.easy);
  const wrong = submitChange(c, [20], inr.denominations);
  assert.equal(c.changeWrong, 0, 'the original is untouched');
  const right = submitChange(wrong.customer, [20, 10, 5, 2, 1], inr.denominations);
  assert.equal(statusOf(right.customer), 'retry');
});

test('"No change needed" is right only when nothing is due', () => {
  const exactSale = { ...sale, paidTotal: 62, changeDue: 0 };
  const ok = submitNoChange({ ...startCustomer(exactSale, LEVELS.hard), phase: 'change' });
  assert.equal(ok.kind, 'exact');
  assert.equal(statusOf(ok.customer), 'first');

  let c = { ...startCustomer(sale, LEVELS.hard), phase: 'change' };
  const kinds = [];
  for (let i = 0; i < MAX_CHANGE_RETRIES + 1; i++) {
    const r = submitNoChange(c);
    kinds.push(r.kind);
    assert.equal(r.due, 38);
    c = r.customer;
  }
  assert.deepEqual(kinds, ['owed', 'owed', 'failed']);
});

// ---- messages ---------------------------------------------------------------------

test('messages state the exact difference', () => {
  assert.equal(changeMessage({ kind: 'tooMuch', diff: 5 }, inr, LEVELS.easy), 'You gave ₹5 too much.');
  assert.equal(changeMessage({ kind: 'tooLittle', diff: 3 }, inr, LEVELS.easy), 'The customer needs ₹3 more.');
  assert.equal(changeMessage({ kind: 'failed', diff: 7, check: { kind: 'tooLittle' } }, inr, LEVELS.easy), 'The customer needs ₹7 more.');
  assert.match(changeMessage({ kind: 'empty', diff: 38 }, inr, LEVELS.hard), /No change needed/);
  assert.doesNotMatch(changeMessage({ kind: 'empty', diff: 38 }, inr, LEVELS.easy), /No change needed/);
});

test('total hints get more helpful, and the third miss shows the total', () => {
  const two = { items: [{ price: 45 }, { price: 30 }], total: 75 };
  assert.match(totalMessage('wrong', two, 1, inr), /Add up all the price tags/);
  assert.match(totalMessage('wrong', two, 2, inr), /₹45 \+ ₹30 = ₹75/);
  assert.match(totalMessage('revealed', two, 3, inr), /The total is ₹75/);
});

// ---- scoring ----------------------------------------------------------------------

test('round stars follow accuracy, and 5 smart sales earn a bonus star (never above 3)', () => {
  const all = Array(6).fill('first');
  assert.equal(roundStars(all, 0), 3);
  const mixed = ['first', 'first', 'first', 'retry', 'retry', 'retry']; // 4.5/6 = 75%
  assert.equal(roundStars(mixed, 0), 2);
  assert.equal(roundStars(mixed, SMART_STAR_THRESHOLD - 1), 2);
  assert.equal(roundStars(mixed, SMART_STAR_THRESHOLD), 3, 'the Smart change bonus star');
  const poor = ['failed', 'failed', 'failed', 'retry', 'failed', 'first']; // 1.5/6 = 25%
  assert.equal(roundStars(poor, 0), 1);
  assert.equal(roundStars(poor, 6), 2);
  assert.equal(roundStars(all, 6), 3);
  assert.equal(roundStars([], 0), 1);
});

test('sale scores: 10 first time, 5 after a retry, 0 failed, plus 5 for smart change', () => {
  assert.deepEqual([saleScore('first', false), saleScore('retry', false), saleScore('failed', false)], [10, 5, 0]);
  assert.equal(saleScore('first', true), 15);
  assert.equal(saleScore('retry', true), 10);
});
