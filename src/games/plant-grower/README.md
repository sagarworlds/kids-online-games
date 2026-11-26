# Plant Grower

Grow a plant from a seed to a flower in 7 days by giving it the right water, sunlight and fertiliser. Too little or too
much makes it droop. For ages 8–10. Works with touch, mouse and keyboard, and offline once loaded.

## How to play

1. Pick a level and a seed (sunflower, tomato, cactus or rice).
2. Each **morning** the weather is shown first. Then set three sliders, **Water, Sunlight and Fertiliser** (0 to 10). They
   start where yesterday's were left, so you adjust instead of starting again. Press **Next day**.
3. The plant grows (or does not), shows how it feels in a thought bubble, and a **day card** says what changed.
4. After day 7 you get 1–3 stars and a **plant journal** with a drawing and the reason for every day.

| Level | Seeds | Weather | What the game tells you |
|-------|-------|---------|-------------------------|
| Easy | Sunflower | none | the ideal range is marked on every slider; each day card says why |
| Medium | + Tomato, Cactus | one rainy and one cloudy day | the plant's thought bubble only |
| Hard | + Rice | rain, clouds and a two-day heat wave | nothing while growing; the journal explains afterwards |

**Weather:** rain adds 3 water by itself, clouds hold the sunlight to 4, a heat wave takes 3 water away. The sliders show what
the plant will really get. The week's weather is fixed by a seed before day 1.

**How it works (the rules, as in the spec):** each need scores 1 if it is inside the plant's ideal range, 0.5 if it is no more
than 2 outside it, otherwise 0. Health changes by 10 × (sum of the three scores − 2), kept between 0 and 100, and starts at 70.
At the end of a day the plant grows one stage if health is 60 or more, stays if it is 30 to 59, and wilts below 30 (it can recover).
After day 7: health 80 or more = 3 stars, 60 or more = 2, otherwise 1. **A plant never dies**; at worst the game says
"Let's try again!".

## How it is built

- `data/plants.json` has the four plants, their ideal ranges, stage names and a fact. It is checked on load.
- `logic/` is pure and deterministic (no DOM, storage, timers or `Math.random`): `simulation.nextDay`, `weather.createWeather`
  (seeded), `messages` (the worst need becomes a kind sentence; the journal explanation) and scoring.
  `tests/plant-grower/` covers in-range, near-range, out-of-range and clamping, and proves that **every plant can reach 3 stars
  and the last stage with ideal inputs, at every level, for 120 different weeks of weather**.
- `ui/PlantArt.js` draws each plant as SVG shapes (no image files). Growth is CSS transitions: stems grow, leaves unfold.
  A happy plant sways and its pot smiles; thirsty droops; too much water leaves a puddle; too much sun makes sweat drops;
  too much fertiliser browns the leaves. `ui/NeedSlider.js` is a native `<input type="range">`, so arrow keys, Home/End and touch all work.
- `scenes/` has the seed picker, the garden and the results with the journal.

## 3D view

On a device that can do WebGL 2 the garden is 3D. A **3D view / 2D view** button on the seed picker switches and remembers the
choice. It is made there and not in the garden, because switching in the middle of a week would start the week again. The
weather, the sliders, the simulation, the thought bubbles, the day cards, the stars and the journal are the same code as 2D (the
3D garden extends `GardenScene` through two small hooks: how the picture is made and how the screen is laid out), so the same seed
and the same choices give the same week and the same stars in both views.

- **The plant** grows taller with each stage and puts out leaves, buds, flowers and fruit (a sunflower's head, a tomato's green
  and then red fruit, a cactus's arms and pink flower, rice ears that turn gold). Drag, pinch, scroll or use the arrow keys to turn
  and zoom it. It leans and its leaves hang when it is thirsty or wilting; the leaves go pale when it is hungry, dark when it
  has too little sun, brown with too much fertiliser; the soil is dry when it is thirsty; there is a puddle round the pot for too
  much water and drops of sweat for too much sun; the pot smiles, looks unsure or frowns.
- **The sky** shows the day's weather: a bright sun, clouds, rain falling, or a big hot sun with haze. When you press **Next day**
  the sun crosses the sky from left to right and the sky darkens towards evening; the next morning starts again with the sun low
  on the left.
- **Everything the picture shows is also written on the page**: the weather note, the health, the plant's thought bubble and
  the day card, so the game can be played without seeing the picture.
- **If 3D cannot run**: no WebGL 2 means no 3D button; if the 3D file will not load, the flat garden opens. If 3D cannot start,
  or the graphics are lost *in the middle of a week*, the picture carries on in the same place as the flat plant (on the
  weather's sky colour), with the same day, health and sliders, and stays flat for the rest of the visit. That only lasts for the
  visit; it does not change the saved choice.
- **On a phone** the picture takes at least 45% of the screen's height with the sliders and the Next day button under it (the panel
  scrolls, the page does not). With "less motion" the sun does not travel, the clouds and rain stand still, the plant does not
  sway and it grows without easing. three.js is loaded with `import()` only when the 3D garden opens.

Files: `logic/look3d.js` (how big the plant is at each stage, how much it droops, the colour changes, the weather's look, the sun's
path, the sky's colour, the rain), unit-tested in `tests/plant-grower/look3d.test.js`; and `three/` (`plantModels` for the four plants,
the pot, the clouds; `PlantStage3D` for the scene; `Garden3DScene`).

## Needs a human check

The ideal ranges and plant facts are simplified for a game and were not checked with a gardener or a botanist: the rice
range (water 8–10) follows the spec, the others are reasonable game values. Please read the plant facts and the journal wording.
The plant pictures are simple shapes, not botanical drawings.

The 3D plants, the pot's face and the sky are simple shapes too. Please look at them on a real phone: how big the plant is on a small
screen and how the sun's path fits a narrow picture have only been checked in a browser at phone sizes.
