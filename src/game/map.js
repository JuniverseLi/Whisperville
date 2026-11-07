import { RESIDENTS } from '../simulation/scenario.js';
export const TILE = 16;
export const MAP_WIDTH = 72;
export const MAP_HEIGHT = 50;
export const SPAWN = [23, 30];
export const BUILDINGS = [
  {
    id: 'florist',
    name: '木木花店',
    resident: 'zhou',
    x: 6,
    y: 4,
    w: 11,
    h: 10,
    floor: 'wood',
    color: '#c78d68',
    home: [11, 8],
  },
  {
    id: 'workshop',
    name: '自行车修理铺',
    resident: 'chen',
    x: 25,
    y: 3,
    w: 12,
    h: 10,
    floor: 'stone',
    color: '#7e9d96',
    home: [30, 7],
  },
  {
    id: 'school',
    name: '耳语小学',
    resident: 'qiao',
    x: 53,
    y: 4,
    w: 14,
    h: 12,
    floor: 'tile',
    color: '#8798b5',
    home: [60, 7],
  },
  {
    id: 'cafe',
    name: '朵朵咖啡馆',
    resident: 'lin',
    x: 7,
    y: 22,
    w: 15,
    h: 11,
    floor: 'wood',
    color: '#bd795a',
    home: [16, 26],
  },
  {
    id: 'post',
    name: '旧邮局',
    resident: 'tang',
    x: 30,
    y: 20,
    w: 11,
    h: 9,
    floor: 'wood',
    color: '#b9a06d',
    home: [35, 24],
  },
  {
    id: 'library',
    name: '镇图书馆',
    resident: 'xu',
    x: 54,
    y: 24,
    w: 13,
    h: 11,
    floor: 'wood',
    color: '#929f79',
    home: [60, 28],
  },
  {
    id: 'home',
    name: '河畔小屋',
    resident: 'mei',
    x: 9,
    y: 38,
    w: 14,
    h: 10,
    floor: 'wood',
    color: '#ac8aab',
    home: [17, 42],
  },
  {
    id: 'press',
    name: '社区报社',
    resident: 'bo',
    x: 31,
    y: 37,
    w: 13,
    h: 11,
    floor: 'wood',
    color: '#bba16e',
    home: [37, 42],
  },
];
export const NPC_HOMES = Object.fromEntries(
  RESIDENTS.map((person) => [
    person.id,
    person.spawn || BUILDINGS.find((b) => b.id === person.home).home,
  ]),
);
export const PUBLIC_SPOTS = [
  [22, 18],
  [38, 17],
  [43, 24],
  [27, 34],
  [51, 20],
  [51, 36],
  [26, 45],
];

function random(seed) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}
export const indexOf = (x, y) => y * MAP_WIDTH + x;

export function createMap(seed = 42) {
  const terrain = new Uint8Array(MAP_WIDTH * MAP_HEIGHT);
  const solid = new Uint8Array(terrain.length);
  const props = [];
  const set = (x, y, type, blocked = false) => {
    if (x < 0 || y < 0 || x >= MAP_WIDTH || y >= MAP_HEIGHT) return;
    terrain[indexOf(x, y)] = type;
    solid[indexOf(x, y)] = Number(blocked);
  };
  const rect = (x, y, w, h, type, blocked = false) => {
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) set(col, row, type, blocked);
  };
  rect(0, 0, MAP_WIDTH, 1, 0, true);
  rect(0, MAP_HEIGHT - 1, MAP_WIDTH, 1, 0, true);
  rect(0, 0, 1, MAP_HEIGHT, 0, true);
  rect(MAP_WIDTH - 1, 0, 1, MAP_HEIGHT, 0, true);
  rect(2, 17, 68, 5, 1);
  rect(34, 17, 12, 5, 6);
  rect(23, 2, 4, 46, 1);
  rect(3, 34, 67, 3, 1);
  rect(3, 48, 67, 1, 1);
  rect(46, 0, 4, MAP_HEIGHT, 2, true);
  rect(46, 18, 4, 4, 3);
  rect(46, 34, 4, 3, 3);
  const add = (kind, x, y, w = 1, h = 1, blocked = true, color) => {
    props.push({ kind, x, y, w, h, color });
    if (blocked)
      for (let row = y; row < y + h; row++)
        for (let col = x; col < x + w; col++) solid[indexOf(col, row)] = 1;
  };
  for (const b of BUILDINGS) {
    const floor = b.floor === 'tile' ? 5 : b.floor === 'stone' ? 6 : 4;
    rect(b.x, b.y, b.w, b.h, floor);
    for (let x = b.x; x < b.x + b.w; x++) {
      set(x, b.y, 7, true);
      set(x, b.y + b.h - 1, 8, true);
    }
    for (let y = b.y; y < b.y + b.h; y++) {
      set(b.x, y, 8, true);
      set(b.x + b.w - 1, y, 8, true);
    }
    const door = b.x + Math.floor(b.w / 2);
    set(door, b.y + b.h - 1, floor);
    set(door + 1, b.y + b.h - 1, floor);
    rect(door, b.y + b.h, 2, Math.max(1, Math.min(3, MAP_HEIGHT - b.y - b.h)), 1);
    if (b.id === 'cafe') {
      add('counter', b.x + 2, b.y + 2, 10, 1);
      add('coffee', b.x + 3, b.y + 2, 1, 1, false);
      add('table', b.x + 3, b.y + 6, 2, 2);
      add('table', b.x + 10, b.y + 6, 2, 2);
      add('rug', b.x + 6, b.y + 7, 3, 2, false, '#b97d66');
      add('plant', b.x + 1, b.y + 1);
      add('plant', b.x + b.w - 2, b.y + 1);
    } else if (b.id === 'school') {
      add('board', b.x + 3, b.y, 7, 1, false);
      for (const x of [b.x + 2, b.x + 9])
        for (const y of [b.y + 4, b.y + 6, b.y + 8]) add('desk', x, y, 2, 1);
      add('shelf', b.x + 1, b.y + 1, 2, 2);
      add('plant', b.x + b.w - 2, b.y + 1);
    } else if (b.id === 'library') {
      for (const x of [b.x + 2, b.x + 9])
        for (const y of [b.y + 2, b.y + 5]) add('shelf', x, y, 2, 2);
      add('table', b.x + 5, b.y + 7, 3, 1);
      add('rug', b.x + 5, b.y + 2, 3, 4, false, '#9a9d78');
    } else if (b.id === 'home') {
      add('bed', b.x + 2, b.y + 2, 2, 3);
      add('counter', b.x + 8, b.y + 2, 3, 1);
      add('table', b.x + 9, b.y + 5, 2, 2);
      add('rug', b.x + 5, b.y + 4, 3, 3, false, '#b091aa');
    } else if (b.id === 'florist') {
      for (const x of [b.x + 2, b.x + 7])
        for (const y of [b.y + 2, b.y + 5]) add('flowers', x, y, 2, 1);
      add('counter', b.x + 3, b.y + 7, 4, 1);
    } else if (b.id === 'workshop') {
      add('counter', b.x + 2, b.y + 2, 3, 1);
      add('tools', b.x + 2, b.y, 4, 1, false);
      add('bicycle', b.x + 8, b.y + 3, 2, 2);
      add('bicycle', b.x + 3, b.y + 6, 2, 1);
    } else if (b.id === 'post') {
      add('counter', b.x + 2, b.y + 2, 3, 1);
      add('shelf', b.x + 7, b.y + 2, 2, 2);
      add('mailbox', b.x + b.w + 1, b.y + b.h);
    } else {
      add('press', b.x + 2, b.y + 2, 4, 2);
      add('desk', b.x + 9, b.y + 4, 2, 1);
      add('shelf', b.x + 2, b.y + 7, 2, 2);
    }
  }
  // The fountain and benches leave the main avenue open on both sides.
  add('fountain', 40, 17, 3, 3);
  add('bench', 35, 17, 2, 1);
  add('bench', 44, 19, 2, 1);
  for (const [x, y] of [
    [5, 19],
    [20, 19],
    [29, 18],
    [51, 18],
    [68, 20],
    [5, 35],
    [28, 35],
    [51, 35],
    [68, 35],
  ])
    add('lamp', x, y);
  // Front gardens leave the two-tile entrances and the main roads clear.
  for (const b of BUILDINGS) {
    const front = b.y + b.h;
    if (front < 48) {
      add('flowers', b.x + 1, front, 2, 1, true);
      add('flowers', b.x + b.w - 3, front, 2, 1, true);
    }
  }
  for (const x of [4, 6, 8, 15, 17]) add('fence', x, 15, 2, 1, true);
  for (const [x, y] of [
    [3, 26],
    [5, 29],
    [27, 15],
    [43, 29],
    [51, 25],
    [69, 13],
    [68, 40],
    [5, 41],
  ])
    add('shrub', x, y, 1, 1, true);
  add('crate', 30, 17, 2, 1, true);
  add('crate', 29, 39, 2, 1, true);
  add('garden', 3, 5, 2, 8, false);
  add('garden', 4, 39, 3, 6, false);
  add('garden', 68, 6, 2, 7, false);
  add('bunting', 5, 17, 13, 1, false);
  const rng = random(seed);
  for (let y = 1; y < MAP_HEIGHT - 1; y++)
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (terrain[indexOf(x, y)] !== 0 || solid[indexOf(x, y)]) continue;
      const nearBuilding = BUILDINGS.some(
        (b) => x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 2 && y <= b.y + b.h + 2,
      );
      const nearSpawn = Math.abs(x - SPAWN[0]) + Math.abs(y - SPAWN[1]) < 5;
      if (nearBuilding || nearSpawn) continue;
      const value = rng();
      if (value < 0.12 && x > 1 && y > 2)
        add('tree', x, y, 1, 1, true, rng() > 0.7 ? 'autumn' : 'green');
      else if (value < 0.2) add('wildflowers', x, y, 1, 1, false, rng() > 0.5 ? 'yellow' : 'pink');
      else if (value < 0.23) add('stone', x, y);
    }
  return { terrain, solid, props, buildings: BUILDINGS, width: MAP_WIDTH, height: MAP_HEIGHT };
}

export function isWalkable(map, x, y) {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    x >= 0 &&
    y >= 0 &&
    x < MAP_WIDTH &&
    y < MAP_HEIGHT &&
    map.solid[indexOf(x, y)] === 0
  );
}
export function findPath(map, from, to) {
  const sx = Math.floor(from[0]),
    sy = Math.floor(from[1]),
    tx = Math.floor(to[0]),
    ty = Math.floor(to[1]);
  if (!isWalkable(map, sx, sy) || !isWalkable(map, tx, ty)) return [];
  const start = indexOf(sx, sy),
    goal = indexOf(tx, ty),
    previous = new Int32Array(MAP_WIDTH * MAP_HEIGHT).fill(-1),
    queue = [start];
  previous[start] = start;
  for (let head = 0; head < queue.length; head++) {
    const value = queue[head];
    if (value === goal) break;
    const x = value % MAP_WIDTH,
      y = Math.floor(value / MAP_WIDTH);
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy;
      if (!isWalkable(map, nx, ny)) continue;
      const next = indexOf(nx, ny);
      if (previous[next] !== -1) continue;
      previous[next] = value;
      queue.push(next);
    }
  }
  if (previous[goal] === -1) return [];
  const result = [];
  for (let value = goal; value !== start; value = previous[value])
    result.unshift([value % MAP_WIDTH, Math.floor(value / MAP_WIDTH)]);
  return result;
}
export function nearestWalkable(map, x, y) {
  for (let r = 0; r < 10; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) if (isWalkable(map, x + dx, y + dy)) return [x + dx, y + dy];
  return null;
}
export function interactionPath(map, from, to) {
  return (
    [
      [0, 1],
      [1, 0],
      [-1, 0],
      [0, -1],
    ]
      .map(([dx, dy]) => {
        const target = [Math.floor(to[0]) + dx, Math.floor(to[1]) + dy];
        const path = findPath(map, from, target);
        return {
          path,
          target,
          ok:
            path.length > 0 ||
            (Math.floor(from[0]) === target[0] && Math.floor(from[1]) === target[1]),
        };
      })
      .filter((item) => item.ok)
      .sort((a, b) => a.path.length - b.path.length)[0] || null
  );
}
export function locationAt(x, y) {
  return (
    BUILDINGS.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)?.name ||
    (x > 46 ? '河东街区' : '河畔街区')
  );
}

export function canTalk(map, from, to, radius = 1.8) {
  const distance = Math.hypot(from[0] - to[0], from[1] - to[1]);
  if (distance >= radius) return false;
  const steps = Math.max(1, Math.ceil(distance * 4));
  for (let step = 0; step <= steps; step++) {
    const t = step / steps;
    if (
      !isWalkable(
        map,
        Math.floor(from[0] + (to[0] - from[0]) * t),
        Math.floor(from[1] + (to[1] - from[1]) * t),
      )
    )
      return false;
  }
  return true;
}
