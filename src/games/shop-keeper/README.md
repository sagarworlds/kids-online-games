# Shop Keeper (`shop-keeper`)

The child runs a small shop. A customer buys things and pays with a note; the child works out the change and drags
coins and notes from the cash drawer into the change tray.

**Learning goal:** money recognition, adding prices, subtracting to find change, and making an amount with the fewest
coins and notes.

## How to play

1. Pick a level. A round is 6 customers.
2. Read the price tags. On **Easy** the till shows the total. On **Medium** and **Hard** you add the prices up and type
   the total first (three wrong tries show it), and only then does the till open.
3. Look at what the customer pays, work out the change, and put it in the tray: **drag** coins and notes from the
   drawer, or **tap** them (or press Enter on a focused piece). Tap a piece in the tray, or drag it back to the drawer,
   to take it out again.
4. Press **Give change**. On Hard some customers pay the exact total: tap **No change needed** for those.
5. Wrong change tells you the exact difference ("You gave ₹5 too much", "The customer needs ₹3 more"). You can fix it
   twice; the third wrong try shows the right change in the tray and the customer moves on.

| Level | Items | Prices | Payment | Total |
| --- | --- | --- | --- | --- |
| Easy | 1 | ₹1–₹50 | The next note up (₹10, ₹20, ₹50 or ₹100) | Shown; the tray shows a running total |
| Medium | 2 | ₹5–₹150 each | One note, one of the 3 closest above the total | You add it up; tray total shows after "Give change" |
| Hard | 3 | ₹10–₹450 each (bill at most ₹1000) | 1 or 2 notes (₹500 + ₹100 …), about 1 customer in 5 pays exactly | You add it up |

## Scoring

- Per customer: **10** points for right with no mistakes, **5** for right after a mistake, **0** if the answer had to
  be shown; **+5** for **Smart change** (exact change in the fewest possible pieces).
- Stars: a customer with no mistakes counts 1, one with mistakes counts ½, one whose answer was shown counts 0; the
  shared rule is applied to the average (90% = 3 stars, 70% = 2, otherwise 1). **5 or more Smart change customers in
  a round add a bonus star** (never above 3).
- The results screen shows the stars, **Perfect change** (right first time) and **Smart change** counts, and each
  customer with a tick or a cross, plus how many pieces were used against the fewest possible.

## Rules worth knowing

- **Whole units only.** All money is integers; there are no decimals anywhere, so nothing can round wrongly.
- **Fewest pieces is computed exactly** (`logic/change.js`, a small dynamic-programming table), not with the "largest
  piece first" shortcut. Greedy happens to be right for rupees, but the currency is data, and for a set like 1, 3, 4 it
  is wrong (6 = 3 + 3, not 4 + 1 + 1). The test compares it with an independent breadth-first search for every amount
  from 1 to 999, and with greedy for rupees.
- **An empty tray never counts as "no change".** Giving change with nothing in the tray just reminds the child, so
  "No change needed" has to be chosen on purpose.
- The tray holds at most 24 pieces, so a pile of ₹1 coins cannot fill the screen.
- Every price from ₹1 to ₹450 has at least 3 items that can cost it (checked when `items.json` loads, and in tests), so
  a sale never goes looking for an item that does not exist.

## Using another currency

Everything about money lives in `data/currency.inr.json`: the symbol, and each coin and note with its value, kind,
label and colour. To play with another currency, add a file of the same shape (for example `currency.usd.json`) and
change the one `CURRENCY_FILE` line in `main.js`. The coins and notes in the drawer, every message and the payments all
follow the file; no other code mentions rupees. The file is validated on load (it needs a denomination of 1 and at
least one note), and a test swaps in a dollar currency and plays sales with it. Customers pay with notes only, and
Easy only uses notes that appear in its list (₹10, ₹20, ₹50, ₹100), falling back to all notes if none match.

The drawn coins and notes are simple generic illustrations (round for coins, wide for notes, with the value written on
them), not copies of real money.

## Drag and drop (`src/engine/ui/DragDrop.js`)

Shared with the other games that need it. `makeDraggable(node, { getZones, onDrop, onActivate })`:

- **Pointer drag** (mouse, touch or pen): a copy of the element follows the pointer once it moves 8 px; the drop zone
  under it gets a dashed outline. Released over a zone, `onDrop` decides (return `false` to refuse); released anywhere
  else the copy slides back ("snap-back"). Escape or a cancelled pointer also abandons the drag.
- **Keyboard and tap**: Enter or Space on the focused `<button>`, or a plain tap, calls `onActivate`. That is the
  keyboard alternative: every drag has a one-key equivalent.
- The geometry (drag threshold, which of several overlapping zones is under the pointer) is in
  `src/engine/utils/dragMath.js` and is unit-tested.

## File map

```
index.html, main.js, style.css    Page, composition root (routes + data loading), styles
scenes/                           MenuScene, ShopScene, ResultScene (+ ShopKeeperScene base with routes and data)
ui/                               Counter (items, price tags, till), CashDrawer, ChangeTray, MoneyPiece
logic/                            Pure rules, no DOM (all unit-tested):
  change.js                       sum, minPieces, minBreakdown, checkChange
  customer.js                     one customer's sale: total step, change step, retries
  saleGenerator.js                always-completable sales, exact-payment sales built backwards
  levels.js, scoring.js, messages.js, currency.js, items.js
data/                             currency.inr.json, items.json (42 items with price ranges)
```

## Not yet verified

Tested in headless Chromium: full Easy, Medium and Hard rounds with mouse drags, keyboard, snap-back, Escape, a touch
drag (injected through the DevTools protocol) and touch taps on a phone-sized viewport, with three random seeds. One
oddity: in one harness variant a synthetic tap right after a synthetic touch drag was occasionally not delivered by
Chromium (0 of 16 in a controlled repeat), so a real-device check of tap-after-drag is still worth doing. Not tried
on Safari or a real touch screen.
