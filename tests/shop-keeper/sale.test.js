import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { sum } from '../../src/games/shop-keeper/logic/change.js';
import { validateCurrency } from '../../src/games/shop-keeper/logic/currency.js';
import { validateItems, itemsAtPrice } from '../../src/games/shop-keeper/logic/items.js';
import { generateSale, generateRound } from '../../src/games/shop-keeper/logic/saleGenerator.js';
import { startCustomer, submitTotal, submitChange } from '../../src/games/shop-keeper/logic/customer.js';
import { totalMessage, totalRightMessage } from '../../src/games/shop-keeper/logic/messages.js';
import { LEVEL_IDS, LEVELS, getLevel } from '../../src/games/shop-keeper/logic/levels.js';
import { PERCENTS, amountOff, discountLine, pickMarkedPrice, priceStep, salePrice, starsKey } from '../../src/games/shop-keeper/logic/sale.js';
import { createRng } from '../../src/engine/utils/random.js';

const read = (name) => JSON.parse(readFileSync(new URL(`../../src/games/shop-keeper/data/${name}`, import.meta.url), 'utf8'));
const inr = validateCurrency(read('currency.inr.json'));
const items = validateItems(read('items.json'));
const data = { currency: inr, items };
const throwsCode = (fn, code) => assert.throws(fn, (error) => error.code === code, `expected ${code}`);

// ---- the discount arithmetic -----------------------------------------------------------

test('a discount is a tenth, a fifth, a quarter or a half, and needs a price that makes it a whole number of rupees', () => {
  assert.deepEqual([...PERCENTS], [10, 20, 25, 50]);
  assert.deepEqual(PERCENTS.map(priceStep), [10, 5, 4, 2]);
  for (const percent of PERCENTS) {
    // Every price that is a multiple of the step comes out whole, and no price that is not a multiple does.
    for (let price = 1; price <= 400; price++) {
      const whole = Number.isInteger((price * percent) / 100);
      assert.equal(whole, price % priceStep(percent) === 0, `${percent}% of ${price}`);
    }
  }
});

test('amountOff and salePrice work the examples a child would: half of 40, a quarter of 60, a tenth of 90', () => {
  assert.equal(amountOff(40, 50), 20);
  assert.equal(salePrice(40, 50), 20);
  assert.equal(amountOff(60, 25), 15);
  assert.equal(salePrice(60, 25), 45);
  assert.equal(amountOff(90, 10), 9);
  assert.equal(salePrice(90, 10), 81);
  assert.equal(salePrice(35, 20), 28);
});

test('a discount that is not whole rupees, or not one the shop gives, is an error with the numbers in it, never a rounded price', () => {
  throwsCode(() => amountOff(45, 50), 'BAD_DISCOUNT'); // half of 45 is 22.5
  throwsCode(() => amountOff(30, 25), 'BAD_DISCOUNT'); // a quarter of 30 is 7.5
  throwsCode(() => amountOff(25, 10), 'BAD_DISCOUNT');
  throwsCode(() => amountOff(40, 33), 'BAD_DISCOUNT');
  throwsCode(() => priceStep(0), 'BAD_DISCOUNT');
  for (const marked of [0, -10, 2.5, NaN, '40']) throwsCode(() => amountOff(marked, 50), 'BAD_DISCOUNT');
  assert.throws(() => amountOff(45, 50), (error) => error.context.marked === 45 && error.context.percent === 50 && /45/.test(error.message));
});

test('a marked price is picked from the range, whole for its percent, and every such price can come up', () => {
  const rng = createRng(5);
  for (const percent of PERCENTS) {
    const seen = new Set();
    for (let i = 0; i < 4000; i++) {
      const marked = pickMarkedPrice(percent, 20, 100, rng);
      assert.ok(marked >= 20 && marked <= 100, `${marked} is in the range`);
      assert.equal(marked % priceStep(percent), 0);
      seen.add(marked);
    }
    const all = [];
    for (let price = 20; price <= 100; price++) if (price % priceStep(percent) === 0) all.push(price);
    assert.deepEqual([...seen].sort((a, b) => a - b), all, `every ${percent}% price from 20 to 100`);
  }
  throwsCode(() => pickMarkedPrice(25, 5, 7, rng), 'BAD_DISCOUNT'); // no multiple of 4 from 5 to 7
  throwsCode(() => pickMarkedPrice(33, 10, 100, rng), 'BAD_DISCOUNT');
});

test('a tag is worked out in one sentence, in the shop\'s money', () => {
  assert.equal(discountLine({ price: 30, sale: { marked: 40, percentOff: 25 } }, inr), '25% off ₹40 takes off ₹10, so it costs ₹30.');
  assert.equal(discountLine({ price: 20, sale: { marked: 40, percentOff: 50 } }, inr), '50% off ₹40 takes off ₹20, so it costs ₹20.');
  assert.equal(discountLine({ price: 18, sale: { marked: 20, percentOff: 10 } }, { ...inr, symbol: '$' }), '10% off $20 takes off $2, so it costs $18.');
});

test('stars are kept apart on Sale day: the plain level id, or sale- and the id', () => {
  assert.equal(starsKey('easy', false), 'easy');
  assert.equal(starsKey('hard', true), 'sale-hard');
  assert.notEqual(starsKey('medium', true), starsKey('medium', false));
});

// ---- the levels on Sale day ------------------------------------------------------------

test('on Sale day the child works out the bill on every level, and no customer pays it exactly; the plain levels are untouched', () => {
  for (const id of LEVEL_IDS) {
    const plain = getLevel(id);
    const sale = getLevel(id, { saleDay: true });
    assert.equal(sale.showTotal, false, `${id}: the till does not show the bill`);
    assert.equal(sale.exactChance, 0);
    assert.equal(sale.noChangeButton, false);
    for (const key of ['items', 'maxTotal', 'paymentNotes', 'maxPaymentNotes', 'paymentChoices', 'priceMin', 'priceMax']) assert.deepEqual(sale[key], plain[key], `${id}.${key} is the level's own`);
    assert.equal(getLevel(id, { saleDay: false }), plain);
  }
  assert.equal(LEVELS.easy.showTotal, true, 'Easy still shows the total on other days');
  assert.equal(LEVELS.hard.exactChance, 0.2);
  throwsCode(() => getLevel('impossible', { saleDay: true }), 'UNKNOWN_LEVEL');
});

test('every level has discounts the shop gives, and a price range where each of them comes out whole, with items to sell at every marked price', () => {
  for (const id of LEVEL_IDS) {
    const { percents, markedMin, markedMax, blurb } = LEVELS[id].sale;
    assert.ok(blurb.length > 0);
    assert.ok(percents.every((percent) => PERCENTS.includes(percent)), id);
    for (const percent of percents) {
      assert.doesNotThrow(() => pickMarkedPrice(percent, markedMin, markedMax, createRng(1)), `${id}: ${percent}%`);
      for (let marked = markedMin; marked <= markedMax; marked++) {
        if (marked % priceStep(percent) === 0) assert.ok(itemsAtPrice(items, marked).length >= 3, `${id}: items for a marked price of ${marked}`);
      }
    }
  }
});

// ---- a Sale day customer ---------------------------------------------------------------

test('every Sale day sale at every level is well made: whole discounts, the bill is the sum of the sale prices, the payment covers it with change due', () => {
  for (const id of LEVEL_IDS) {
    const level = getLevel(id, { saleDay: true });
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const sale = generateSale(id, rng, data, { saleDay: true });
      const where = `${id} #${i}`;
      assert.equal(sale.saleDay, true);
      assert.equal(sale.items.length, level.items, where);
      for (const item of sale.items) {
        const { marked, percentOff } = item.sale;
        assert.ok(level.sale.percents.includes(percentOff), `${where}: ${percentOff}% is one of the level's`);
        assert.ok(marked >= level.sale.markedMin && marked <= level.sale.markedMax, `${where}: marked ${marked}`);
        assert.equal(item.price, salePrice(marked, percentOff), `${where}: the price is the marked price less the discount`);
        assert.ok(Number.isInteger(item.price) && item.price >= 1 && item.price < marked, `${where}: the price is whole and below the tag`);
        assert.ok(itemsAtPrice(items, marked).some((candidate) => candidate.name === item.name), `${where}: ${item.name} can cost the marked ${marked}`);
      }
      assert.equal(sale.total, sum(sale.items.map((item) => item.price)), where);
      assert.ok(sale.total <= level.maxTotal, `${where}: the bill is within the level's limit`);
      assert.equal(sale.paidTotal, sum(sale.paid), where);
      assert.ok(sale.changeDue > 0, `${where}: change is due (no exact payments on Sale day)`);
      assert.equal(sale.changeDue, sale.paidTotal - sale.total, where);
    }
  }
});

test('Sale day uses every discount of the level, and Easy is always half price', () => {
  const seen = (id) => {
    const rng = createRng(3);
    return new Set(Array.from({ length: 300 }, () => generateSale(id, rng, data, { saleDay: true })).flatMap((sale) => sale.items.map((item) => item.sale.percentOff)));
  };
  assert.deepEqual([...seen('easy')], [50]);
  assert.deepEqual([...seen('medium')].sort((a, b) => a - b), [10, 25, 50]);
  assert.deepEqual([...seen('hard')].sort((a, b) => a - b), [10, 20, 25, 50]);
});

test('a plain sale has no discounts and no Sale day mark, and the same seed still makes the same round', () => {
  const rng = createRng(11);
  for (let i = 0; i < 200; i++) {
    for (const id of LEVEL_IDS) {
      const sale = generateSale(id, rng, data);
      assert.equal(sale.saleDay, undefined);
      assert.ok(sale.items.every((item) => item.sale === undefined));
    }
  }
  assert.deepEqual(generateRound('medium', 6, createRng(42), data), generateRound('medium', 6, createRng(42), data, { saleDay: false }));
  assert.deepEqual(generateRound('medium', 6, createRng(42), data, { saleDay: true }), generateRound('medium', 6, createRng(42), data, { saleDay: true }));
  assert.notDeepEqual(generateRound('medium', 6, createRng(42), data, { saleDay: true }), generateRound('medium', 6, createRng(42), data));
});

test('a Sale day customer starts at the total, which is the bill after the discounts; typing the full-price total is wrong', () => {
  const level = getLevel('medium', { saleDay: true });
  const sale = generateSale('medium', createRng(21), data, { saleDay: true });
  const customer = startCustomer(sale, level);
  assert.equal(customer.phase, 'total');
  const fullPrice = sum(sale.items.map((item) => item.sale.marked));
  assert.notEqual(fullPrice, sale.total, 'the discounts take something off');
  assert.equal(submitTotal(customer, String(fullPrice)).kind, 'wrong');
  const right = submitTotal(customer, String(sale.total));
  assert.equal(right.kind, 'correct');
  assert.equal(right.customer.phase, 'change');
  // The change is worked from the bill, not from the marked prices.
  const change = submitChange(right.customer, [sale.changeDue], inr.denominations);
  assert.notEqual(change.kind, 'empty');
});

test('the hints after a wrong bill are about the discount, and the second works the first tag out', () => {
  const level = getLevel('medium', { saleDay: true });
  const sale = generateSale('medium', createRng(8), data, { saleDay: true });
  assert.match(totalMessage('wrong', sale, 1, inr), /discount off each price tag/);
  const second = totalMessage('wrong', sale, 2, inr);
  assert.match(second, /Start with the first one: /);
  assert.ok(second.includes(discountLine(sale.items[0], inr)));
  assert.match(totalMessage('revealed', sale, 3, inr), new RegExp(`^The bill is ₹${sale.total}\\. Now give the change\\.$`));
  assert.equal(totalRightMessage(sale), 'Yes! That is the bill. Now give the change.');
  assert.ok(level.sale);
  // On other days the words are the ones they always were.
  const plain = generateSale('medium', createRng(8), data);
  assert.equal(totalMessage('revealed', plain, 3, inr), `The total is ₹${plain.total}. Now give the change.`);
  assert.equal(totalMessage('wrong', plain, 1, inr), 'Not quite. Add up all the price tags again.');
  assert.equal(totalRightMessage(plain), 'Yes! That is the total. Now give the change.');
});
