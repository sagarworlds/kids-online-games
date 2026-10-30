# Food Chain Builder

Draw arrows from each food to the one that eats it, and watch a food chain (or a whole food web) come alive.
For ages 8–10. Works with touch, mouse and keyboard, and offline once loaded.

## How to play

Pick a level, then a habitat: **Forest, Ocean, Pond, Grassland** or **Desert** (15 puzzles in all).

- **Draw an arrow** from the food to the one that eats it: drag from one card to the other, or tap (or press Enter on) the
  food and then the eater. An arrow from *grass* to *rabbit* means the rabbit eats the grass: arrows follow the energy.
  A note about this opens the first time the game is played, and the **How it works** button brings it back.
- **Erase** an arrow by tapping it and pressing **Eraser**, or by focusing it and pressing Delete.
- The little **i** on a card tells you what the living thing is, what it eats and a fun fact.
- **Check** marks every arrow ✔ or ✖. A wrong arrow says why: reversed ("The rabbit doesn't eat the fox — check the arrow
  direction!") or not a food link ("Frogs don't eat grass. Frogs eat insects, snails and worms."). After two Checks that
  still miss an arrow, the game points at a living thing that is food for something.
- When every arrow is there and right, the food web comes alive: dots of energy flow along the arrows and the habitat plays its sound.

| Level | Living things | Shape | Extra |
|-------|---------------|-------|-------|
| Easy | 3–4 | one chain | cards say Producer, Herbivore... |
| Medium | 5–6 | two chains that share a living thing | roles hidden |
| Hard | 7–8 | a food web | **What if?** challenge |

**Stars:** the first Check with no wrong arrows = 3, one or two wrong = 2, more = 1. On Hard, the stars are the average of that and
the What if stars (the shared accuracy rule), rounded to the nearest star with a half going up.

**What if?** (Hard): one living thing disappears. For each other card, say whether there will be more of it (↑), the same (＝) or
fewer (↓). The rule is one step: what eats the missing thing goes down, what it eats goes up, everything else stays the same.

## How it works

- `data/organisms.json` (34 living things) and `data/habitats.json` (5 places, 15 puzzles) hold all content. They are
  checked on load, and the same checks run in `tests/food-chain-builder/`: every link joins organisms of its own habitat;
  every link fits the roles (producers eat nothing, herbivores eat only producers, carnivores no plants); food only
  flows one way; every living thing is in a required link; each level has the right number and shape; and every What
  if answer equals what the one-step rule gives (so the data cannot disagree with the rule).
- `logic/` is pure: `linkChecker` (correct, reversed, invalid, missing, duplicate), `whatIf`, `layout` (cards are placed
  by how far each is from the sun, left to right on a wide board and bottom to top on a phone), `messages`, `scoring`.
- `ui/ArrowLayer.js` draws the arrows as SVG under the cards; `ui/LinkGesture.js` turns a drag between two cards into a link.
  Every arrow is focusable. `scenes/` has one scene each for the menu, the builder, the What if challenge and the results.
- The game remembers your stars, which living things you have met, and that you have read the arrows note, on this device only.

## Needs a human check

The organisms, their roles, diets and fun facts, and the food links of all 15 habitats were written for this game and
**must be read by an adult before classroom use**. A few simplifications are on purpose and worth a look:
foxes, mice, ducks and carp are marked *omnivore* because they eat plants and animals; "Small fish" and "Tuna" are
marked *carnivore*; the habitats are simplified examples, not complete ecosystems; the What if answers follow a one-step rule and
ignore the second-order effects of a real habitat. Habitat sounds are short tone patterns made in the browser.
