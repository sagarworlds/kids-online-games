const SVG_NS = 'http://www.w3.org/2000/svg';
/** Each grid square is 100 x 100 units in the SVG; the SVG scales to fit the screen. */
const CELL = 100;

/** Creates an SVG element with attributes and children. */
function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  for (const child of children) if (child) node.append(child);
  return node;
}

const centre = (n) => n * CELL + CELL / 2;
const BASE_ANGLE = { N: 0, E: 90, S: 180, W: 270 };

/**
 * The board: grid, rocks, battery, gems and the robot, drawn as SVG so it stays
 * sharp at any size and the robot can glide and turn with CSS transitions.
 *
 * Shapes (not colours) carry the meaning: the robot's triangular "nose" shows
 * which way it faces, a cracked-looking rock is solid, the battery has a bolt.
 *
 * @param {import('../logic/levels.js').Level} level
 * @returns {{
 *   el: SVGSVGElement,
 *   reset: () => void,
 *   showFrame: (frame: import('../logic/interpreter.js').Frame) => void,
 *   celebrate: () => void
 * }}
 */
export function createBoardView(level) {
  const [cols, rows] = level.size;
  const root = svg('svg', {
    class: `board world-${level.world}`,
    viewBox: `0 0 ${cols * CELL} ${rows * CELL}`,
    role: 'img',
    'aria-label': `Board with ${cols} columns and ${rows} rows. The robot starts at column ${level.start.x + 1}, row ${level.start.y + 1}. The battery is at column ${level.goal.x + 1}, row ${level.goal.y + 1}.`,
  });

  // Floor tiles in a checker pattern, so squares are easy to count.
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      root.append(svg('rect', { x: x * CELL, y: y * CELL, width: CELL, height: CELL, class: (x + y) % 2 ? 'tile tile--b' : 'tile tile--a' }));
    }
  }

  for (const [x, y] of level.walls) {
    root.append(svg('g', { class: 'rock', transform: `translate(${centre(x)} ${centre(y)})` },
      svg('polygon', { points: '-38,22 -32,-18 -8,-38 24,-32 40,-4 34,28 6,38', class: 'rock__shape' }),
      svg('polyline', { points: '-18,-6 -2,-16 14,-8', class: 'rock__crack' })));
  }

  const battery = svg('g', { class: 'battery', transform: `translate(${centre(level.goal.x)} ${centre(level.goal.y)})` },
    svg('rect', { x: -24, y: -28, width: 48, height: 62, rx: 8, class: 'battery__body' }),
    svg('rect', { x: -10, y: -38, width: 20, height: 11, rx: 3, class: 'battery__cap' }),
    svg('polygon', { points: '5,-18 -13,8 -2,8 -7,26 14,-4 3,-4', class: 'battery__bolt' }));
  root.append(battery);

  /** @type {Map<string, SVGGElement>} */
  const gems = new Map();
  for (const [x, y] of level.gems) {
    const gem = svg('g', { class: 'gem', transform: `translate(${centre(x)} ${centre(y)})` },
      svg('polygon', { points: '0,-26 24,-4 0,26 -24,-4', class: 'gem__shape' }),
      svg('polygon', { points: '0,-26 8,-4 0,26 -8,-4', class: 'gem__facet' }));
    gems.set(`${x},${y}`, gem);
    root.append(gem);
  }

  // The robot faces North (up) at angle 0; the nose triangle points the way it is facing.
  const body = svg('g', { class: 'robot__body' },
    svg('rect', { x: -26, y: -24, width: 52, height: 52, rx: 14, class: 'robot__shell' }),
    svg('circle', { cx: -11, cy: -6, r: 7, class: 'robot__eye' }),
    svg('circle', { cx: 11, cy: -6, r: 7, class: 'robot__eye' }),
    svg('circle', { cx: -11, cy: -8, r: 3, class: 'robot__pupil' }),
    svg('circle', { cx: 11, cy: -8, r: 3, class: 'robot__pupil' }),
    svg('path', { d: 'M -9 14 Q 0 21 9 14', class: 'robot__mouth' }),
    svg('polygon', { points: '0,-46 -13,-28 13,-28', class: 'robot__nose' }));
  const robot = svg('g', { class: 'robot' }, body);
  root.append(robot);

  // The angle accumulates (it never wraps back to 0) so CSS turns the short way round.
  let angle = BASE_ANGLE[level.start.dir];

  const place = (x, y, dir, animate) => {
    const target = BASE_ANGLE[dir];
    // Shortest signed turn from the current angle to the target (-180 to 180).
    const delta = ((target - (((angle % 360) + 360) % 360) + 540) % 360) - 180;
    angle += animate ? delta : target - angle;
    robot.classList.toggle('no-anim', !animate);
    robot.style.transform = `translate(${centre(x)}px, ${centre(y)}px) rotate(${angle}deg)`;
    if (!animate) void robot.getBoundingClientRect(); // apply instantly before animation is switched back on
  };

  const reset = () => {
    place(level.start.x, level.start.y, level.start.dir, false);
    for (const gem of gems.values()) gem.classList.remove('is-picked');
    battery.classList.remove('is-charged');
    robot.classList.remove('is-dancing');
    body.classList.remove('is-bumping');
  };

  reset();

  return {
    el: root,
    reset,
    showFrame(frame) {
      place(frame.x, frame.y, frame.dir, true);
      if (frame.picked) gems.get(frame.picked.join(','))?.classList.add('is-picked');
      if (frame.event === 'bump' || frame.event === 'edge') {
        // Restart the bump animation even if it just played.
        body.classList.remove('is-bumping');
        void body.getBoundingClientRect();
        body.classList.add('is-bumping');
      }
    },
    celebrate() {
      battery.classList.add('is-charged');
      robot.classList.add('is-dancing');
    },
  };
}
