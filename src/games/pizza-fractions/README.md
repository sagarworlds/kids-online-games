# Pizza Fractions (`pizza-fractions`)

The child runs a pizza counter. Each customer orders a fraction of a pizza ("3/8 pepperoni"); the child picks a
topping and taps slices until exactly that fraction is covered, then serves it.

**Learning goal:** read fractions, link numerator and denominator to parts of a whole, recognise equivalent fractions
(1/2 = 2/4 = 4/8) and compare fractions.

## How to play

1. Pick a level. A round is 8 customers.
2. Read the order ticket (the fraction is written stacked, numerator over denominator) and look at how many slices the
   pizza has been cut into.
3. Choose a topping and tap slices to put it on (tap again to take it off). One topping per slice.
4. Press **Serve**. Right: the customer is happy and you earn coins. Wrong: you get a hint such as "You have 2/8
   pepperoni, the order is 3/8", the slices to look at get a dashed red edge, and the customer's thought bubble shows a
   little pizza of what they wanted. You can fix it and serve again **twice**; a third wrong serve and they leave.

Keyboard: Tab to the pizza, arrow keys move between slices, Space or Enter puts the chosen topping on or takes it off.
Tap targets are at least 48 px. Each topping has its own **shape** as well as its colour (spotted disc, ring, cap and
stem, wedge), so nothing depends on colour alone.

| Level | Slice counts | Orders |
| --- | --- | --- |
| Easy | 2, 4, 8 | Same denominator as the cut ("3/8" on an 8-slice pizza) |
| Medium | 4, 6, 8, 12 | Mostly equivalent fractions in lowest terms ("1/3" on 6 slices means 2 slices, "1/2" on 8 means 4) |
| Hard | 6, 8, 10, 12 | Two toppings per order that must not overlap, plus a "Which is bigger?" bonus after each customer |

## Scoring

- Coins: **10** for a serve that is right first time, **5** after a retry, **0** if the customer leaves.
- Stars: an order right first time counts 1, one that needed a retry counts ½, one that was never right counts 0.
  The round's stars use the shared rule on that average (90% = 3 stars, 70% = 2, otherwise 1).
- Hard bonus: **+5** coins for the right answer. It never changes the stars, and a wrong answer costs nothing: the game
  shows the two fractions as bars so the child can see why.

## Rules worth knowing

- Fractions are compared by **cross-multiplication** (`a/b = c/d` when `a·d = c·b`), never with floats, so 4 of 8
  slices satisfies "1/2" exactly. Invalid fractions (zero denominator, negatives, non-integers) throw `BAD_FRACTION`.
- The generator can never make an impossible order. An order is only made when its denominator divides the slice count
  (so "1/3" never appears on an 8-slice pizza); on Hard the two lines also have to fit together on the pizza, and a
  guaranteed one-slice-each fallback means generation cannot fail. Tests check 400 orders per level.
- A topping that was not ordered makes the pizza wrong too, and the hint names it.
- Serving an empty pizza is blocked with "Add some toppings first!" and does not use up a try.
- A tap is mapped to a slice by its **angle from the centre** (`sliceAtPoint`). Slice 0 starts at 12 o'clock and slices
  run clockwise. A tap exactly on a border goes to the slice that starts there, the crust counts as part of its slice,
  and the exact centre is slice 0.

## Design notes

- The pizza is **SVG**, not canvas: every slice is a real focusable element, so keyboard and screen-reader support come
  for free, and it stays sharp at any size. The spec suggested a canvas with `ctx.arc`; the hit test by angle from the
  centre is the same.
- Wrong-serve feedback combines several cues (dashed edge, pulse, text hint, mini pizza) so it is never movement or
  colour alone, and the pulse stops under *reduce motion*.

## File map

```
index.html, main.js, style.css    Page, composition root (routes), styles
scenes/                           MenuScene, KitchenScene, ResultScene (+ PizzaScene base with routes)
ui/                               PizzaView (slices, taps, keys), pizzaArt (SVG geometry and topping shapes),
                                  FractionPie (mini pizza of an order), OrderTicket (stacked fractions)
logic/                            Pure rules, no DOM (all unit-tested):
  fraction.js                     equals, compare, simplify, fromSlices, slicesFor
  pizza.js                        pizza state, toggling, sliceAtPoint
  orderGenerator.js, levels.js    Always-possible orders per level
  orderChecker.js                 checkOrder, hints, which slices to flag
  counter.js                      serve(): empty / correct / wrong / failed, with the retry limit
  bonus.js, scoring.js, toppings.js
```

## Not yet verified

Tested in headless Chromium (desktop and a phone-sized viewport with touch emulation): a full Easy round with a retry
and a customer who leaves, keyboard use, border taps, and the Hard bonus. Not tried on a real touch device or Safari.
