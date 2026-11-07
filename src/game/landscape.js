import { TILE, MAP_WIDTH, MAP_HEIGHT, BUILDINGS, indexOf } from './map.js';

// Shared with the prop renderer: a deliberately small, warm pixel-art palette.
export const SCENE_PALETTE = [
  '#303b2d',
  '#44432f',
  '#665039',
  '#89633f',
  '#ad7d48',
  '#c79955',
  '#dfb86d',
  '#efd294',
  '#fff0c5',
  '#294e31',
  '#3d6b35',
  '#568839',
  '#74a344',
  '#91b953',
  '#b4cf75',
  '#624039',
  '#824b3b',
  '#a85b40',
  '#c6764a',
  '#e69a5f',
  '#f0bb7c',
  '#414e49',
  '#657465',
  '#8a9477',
  '#b2b393',
  '#d4cfac',
  '#375866',
  '#4c8190',
  '#6aa5ae',
  '#99c4be',
  '#cce0cc',
  '#554456',
  '#79556a',
  '#a77389',
  '#cb9da9',
  '#e7c1be',
  '#4f5263',
  '#72768b',
  '#a0a1ae',
  '#d4d3ce',
];
export const PALETTE_RGB = SCENE_PALETTE.map((color) =>
  [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16)),
);

// Remove isolated specks after palette reduction, while retaining outlines and transparency.
export function cleanPixelClusters(data, width, height) {
  const source = data.slice(),
    offsets = [-width - 1, -width, -width + 1, -1, 1, width - 1, width, width + 1];
  const keyAt = (index) => (source[index] << 16) | (source[index + 1] << 8) | source[index + 2];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++) {
      const index = (y * width + x) * 4;
      if (source[index + 3] !== 255) continue;
      const key = keyAt(index),
        neighbors = [];
      let same = 0;
      for (const offset of offsets) {
        const other = index + offset * 4;
        if (source[other + 3] !== 255) continue;
        const color = keyAt(other);
        neighbors.push(color);
        if (color === key) same++;
      }
      if (same >= 2 || neighbors.length < 8) continue;
      let best = key,
        bestCount = 0;
      for (const color of neighbors) {
        let count = 0;
        for (const candidate of neighbors) if (candidate === color) count++;
        if (count > bestCount) {
          best = color;
          bestCount = count;
        }
      }
      if (bestCount < 4) continue;
      const red = best >> 16,
        green = (best >> 8) & 255,
        blue = best & 255;
      if (source[index] + source[index + 1] + source[index + 2] < (red + green + blue) * 0.6)
        continue;
      data[index] = red;
      data[index + 1] = green;
      data[index + 2] = blue;
    }
}
const SIZE = 256;
const grassColors = ['#568839', '#608e3d', '#679641', '#6e9c43'];
const dirtColors = ['#d4a75d', '#d9ad63', '#dfb36a', '#e4b96e'];
const hash = (x, y, s = 0) =>
  ((Math.imul(x + 17 + s, 374761393) ^ Math.imul(y + 31, 668265263)) >>> 0) / 4294967296;
const rect = (ctx, color, x, y, w, h) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};
function noise(x, y, step, seed) {
  const gx = Math.floor(x / step),
    gy = Math.floor(y / step),
    span = SIZE / step;
  const u = (x % step) / step,
    v = (y % step) / step;
  const sx = u * u * (3 - 2 * u),
    sy = v * v * (3 - 2 * v);
  const a = hash(gx % span, gy % span, seed),
    b = hash((gx + 1) % span, gy % span, seed),
    c = hash(gx % span, (gy + 1) % span, seed),
    d = hash((gx + 1) % span, (gy + 1) % span, seed);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}

export function createLandscapeMaterials() {
  const result = {};
  for (const material of ['grass', 'path', 'water']) {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    for (let y = 0; y < SIZE; y += 2)
      for (let x = 0; x < SIZE; x += 2) {
        const value =
          noise(x, y, 32, material === 'grass' ? 7 : 13) * 0.7 + noise(x, y, 64, 31) * 0.3;
        const colors =
          material === 'grass'
            ? grassColors
            : material === 'path'
              ? dirtColors
              : ['#4c8190', '#508b99', '#5493a0', '#5896a3'];
        rect(ctx, colors[Math.min(3, Math.floor(value * 4))], x, y, 2, 2);
      }
    if (material === 'grass') {
      // Three-pixel blades form varied clumps; most marks are close to the base tone.
      for (let y = 2; y < SIZE - 5; y += 5)
        for (let x = 2; x < SIZE - 5; x += 5) {
          const r = hash(x, y, 5);
          if (r < 0.22) continue;
          const px = x + Math.floor(hash(x, y, 21) * 3),
            py = y + Math.floor(hash(x, y, 9) * 3);
          const tall = r > 0.87,
            h = tall ? 4 : 2;
          rect(ctx, tall ? '#3d6b35' : '#568839', px - 1, py + 1, 4, 1);
          rect(ctx, tall ? '#91b953' : '#74a344', px, py - h, 1, h + 1);
          rect(ctx, '#679641', px + 2, py - h + 1, 1, h);
          if (r > 0.72) rect(ctx, '#91b953', px - 1, py - h + 1, 1, 1);
        }
    } else if (material === 'path') {
      for (let y = 4; y < SIZE - 4; y += 8)
        for (let x = 4; x < SIZE - 6; x += 8) {
          const r = hash(x, y, 2);
          if (r < 0.72) continue;
          const px = x + Math.floor(hash(x, y, 3) * 4),
            py = y + Math.floor(hash(x, y, 8) * 4);
          rect(ctx, r > 0.94 ? '#c79955' : '#d4a75d', px, py, r > 0.94 ? 3 : 2, 1);
          if (r > 0.94) rect(ctx, '#efd294', px + 1, py - 1, 2, 1);
        }
    } else {
      for (let y = 5; y < SIZE; y += 12)
        for (let x = 4; x < SIZE - 12; x += 20) {
          const px = x + Math.floor(hash(x, y) * 9),
            py = y + Math.floor(hash(x, y, 1) * 5);
          rect(ctx, '#6aa5ae', px, py, 5, 1);
          rect(ctx, '#99c4be', px + 2, py - 1, 2, 1);
          rect(ctx, '#4c8190', px + 8, py + 4, 4, 1);
        }
    }
    result[material] = canvas;
  }
  return result;
}

function at(map, x, y) {
  const col = Math.floor(x / TILE),
    row = Math.floor(y / TILE);
  return col >= 0 && col < MAP_WIDTH && row >= 0 && row < MAP_HEIGHT
    ? map.terrain[indexOf(col, row)]
    : -1;
}
const insideBuilding = (x, y) =>
  BUILDINGS.some(
    (b) => x >= b.x * TILE && x < (b.x + b.w) * TILE && y >= b.y * TILE && y < (b.y + b.h) * TILE,
  );

// Individually placed slabs, not an opaque stone rectangle. Missing edge stones expose the earth.
export function pavingStones(map) {
  const stones = [];
  for (let y = 6; y < MAP_HEIGHT * TILE; y += 11)
    for (let x = 5; x < MAP_WIDTH * TILE; x += 15) {
      const px = x + (Math.floor(y / 11) % 2) * 7 + Math.floor(hash(x, y, 2) * 3),
        py = y + Math.floor(hash(x, y, 3) * 2);
      if (at(map, px, py) !== 6 || insideBuilding(px, py)) continue;
      const boundary = Math.min(
        ...[
          [0, -8],
          [0, 8],
          [-10, 0],
          [10, 0],
        ].map(([dx, dy]) => (at(map, px + dx, py + dy) === 6 ? 12 : 0)),
      );
      if (boundary === 0 && hash(x, y, 4) < 0.5) continue;
      stones.push({
        x: px,
        y: py,
        w: 10 + Math.floor(hash(x, y, 5) * 4),
        h: 7 + Math.floor(hash(x, y, 6) * 3),
        tone: Math.floor(hash(x, y, 7) * 3),
      });
    }
  return stones;
}
export function paintPaving(ctx, map) {
  for (const stone of pavingStones(map)) {
    const { x, y, w, h, tone } = stone;
    rect(ctx, '#ad7d48', x - 1, y + h - 1, w + 2, 2);
    rect(ctx, ['#8a9477', '#9d9e7d', '#b2b393'][tone], x, y + 1, w, h - 2);
    rect(ctx, ['#a6ab8a', '#b2b393', '#c4c1a0'][tone], x + 2, y, w - 4, h - 1);
    rect(ctx, '#d4cfac', x + 2, y, w - 5, 1);
    rect(ctx, '#7b8062', x + 1, y + h - 2, w - 2, 1);
    if (hash(x, y) > 0.63) {
      rect(ctx, '#74a344', x - 1, y + h - 1, 3, 2);
      rect(ctx, '#91b953', x, y + h - 2, 1, 2);
    }
    if (hash(x, y, 3) > 0.8) rect(ctx, '#8a9477', x + 4, y + 3, 3, 1);
  }
}

export function shorelineSegments(map) {
  const segments = [];
  for (let y = 0; y < MAP_HEIGHT * TILE; y += 2) {
    if (at(map, 46 * TILE + 8, y) !== 2) continue;
    const left = 2 + Math.round((Math.sin(y * 0.09) + Math.sin(y * 0.037)) * 1.5 + 3);
    const right = 2 + Math.round((Math.cos(y * 0.073) + Math.sin(y * 0.041)) * 1.5 + 3);
    segments.push({ y, left, right });
  }
  return segments;
}

export function paintShoreline(ctx, map, drawMaterial) {
  for (const { y, left, right } of shorelineSegments(map)) {
    drawMaterial(0, 46 * TILE, y, left, 2);
    drawMaterial(0, 50 * TILE - right, y, right, 2);
    rect(ctx, '#665039', 46 * TILE + left, y, 1, 2);
    rect(ctx, '#665039', 50 * TILE - right - 1, y, 1, 2);
    rect(ctx, '#6aa5ae', 46 * TILE + left + 1, y, 1, 2);
    rect(ctx, '#6aa5ae', 50 * TILE - right - 2, y, 1, 2);
    if (y % 22 === 0) {
      rect(ctx, '#3d6b35', 46 * TILE + left - 1, y - 3, 1, 4);
      rect(ctx, '#91b953', 46 * TILE + left - 2, y - 5, 1, 4);
    }
  }
}

function steppedEllipse(ctx, color, x, y, w, h) {
  for (let dy = 0; dy < h; dy++) {
    const span = Math.round(
      (Math.sqrt(Math.max(0, 1 - ((dy + 0.5 - h / 2) / (h / 2)) ** 2)) * w) / 2,
    );
    rect(ctx, color, x - span, y + dy, span * 2, 1);
  }
}
export function paintGroundContacts(ctx, map) {
  for (const p of map.props) {
    const x = (p.x + p.w / 2) * TILE,
      y = (p.y + p.h) * TILE;
    if (insideBuilding(x - 1, y - 1)) continue;
    if (
      !['tree', 'shrub', 'lamp', 'bench', 'flowers', 'fountain', 'mailbox', 'crate'].includes(
        p.kind,
      )
    )
      continue;
    const tree = p.kind === 'tree',
      width = tree ? 36 : p.kind === 'lamp' ? 12 : p.w * TILE + 4,
      height = tree ? 9 : 5;
    steppedEllipse(ctx, '#44432f24', x + (tree ? 7 : 2), y - 1, width, height);
    steppedEllipse(ctx, '#44432f32', x, y - 1, tree ? 12 : width * 0.6, 3);
    // A little worn earth and a few blades bind the base to the surrounding ground.
    if (at(map, x, y - 2) === 0 && ['bench', 'lamp', 'tree', 'mailbox'].includes(p.kind)) {
      rect(ctx, '#89633f', x - 3, y - 1, 6, 2);
      rect(ctx, '#ad7d48', x - 2, y - 2, 4, 1);
      rect(ctx, '#3d6b35', x - 6, y - 2, 2, 3);
      rect(ctx, '#91b953', x - 6, y - 4, 1, 3);
      rect(ctx, '#74a344', x + 5, y - 3, 1, 4);
    }
  }
}

export function paintGroundFringe(ctx, map, visualAt) {
  for (let y = 3; y < MAP_HEIGHT * TILE - 3; y += 3)
    for (let x = 3; x < MAP_WIDTH * TILE - 3; x += 3) {
      if (visualAt(map, x, y) !== 0) continue;
      if (
        ![
          [0, 3],
          [0, -3],
          [3, 0],
          [-3, 0],
        ].some(([dx, dy]) => visualAt(map, x + dx, y + dy) === 1)
      )
        continue;
      const r = hash(x, y, 17);
      if (r < 0.45) continue;
      rect(ctx, '#3d6b35', x - 1, y, 3, 1);
      rect(ctx, '#91b953', x, y - 2, 1, 2);
      if (r > 0.83) {
        rect(ctx, '#74a344', x + 2, y - 1, 1, 2);
      }
    }
}
