import { TILE, MAP_WIDTH, MAP_HEIGHT, BUILDINGS, indexOf } from './map.js';
import { createLandscapeMaterials } from './landscape.js';

const PATCH = 128;
const PERIOD = PATCH * 2;
const MATERIALS = ['grass', 'path', 'soil', 'stone', 'water', 'wood'];
const TYPE_MATERIAL = { 0: 'grass', 1: 'path', 2: 'water', 4: 'wood', 6: 'stone' };
const edgeCache = new WeakMap();

// Exteriors and cutaways share one outdoor surface; walls/floors never enter its edge mask.
export function createOutdoorMap(map) {
  const terrain = map.terrain.slice();
  for (const building of map.buildings || BUILDINGS) {
    for (let y = building.y; y < building.y + building.h; y++) {
      for (let x = building.x; x < building.x + building.w; x++) terrain[indexOf(x, y)] = 0;
    }
  }
  return { ...map, terrain };
}

export function createTerrainMaterials(image) {
  const materials = {};
  // The atlas is now used only for indoor wood, indoor stone and soil accents.
  for (const i of [2, 3, 5]) {
    const patch = document.createElement('canvas');
    patch.width = PATCH;
    patch.height = PATCH;
    const context = patch.getContext('2d');
    context.imageSmoothingEnabled = false;
    const column = i % 3,
      row = Math.floor(i / 3),
      left = Math.floor((column * image.width) / 3),
      top = Math.floor((row * image.height) / 2);
    const right = Math.floor(((column + 1) * image.width) / 3),
      bottom = Math.floor(((row + 1) * image.height) / 2);
    context.drawImage(
      image,
      left + 2,
      top + 2,
      right - left - 4,
      bottom - top - 4,
      0,
      0,
      PATCH,
      PATCH,
    );
    const canvas = document.createElement('canvas');
    canvas.width = PERIOD;
    canvas.height = PERIOD;
    const seamless = canvas.getContext('2d');
    seamless.imageSmoothingEnabled = false;
    // Mirrored neighbors share the exact same edge pixels, including at repeat boundaries.
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < 2; col++) {
        seamless.save();
        seamless.translate(col ? PERIOD : 0, row ? PERIOD : 0);
        seamless.scale(col ? -1 : 1, row ? -1 : 1);
        seamless.drawImage(patch, 0, 0);
        seamless.restore();
      }
    materials[MATERIALS[i]] = canvas;
  }
  // Outdoor materials share the same hand-pixelled scale and palette as the scene.
  return Object.assign(materials, createLandscapeMaterials());
}

// Source coordinates depend on world position, so there are no per-tile texture restarts.
export function drawTerrainRect(ctx, materials, type, x, y, width, height) {
  const texture = materials?.[TYPE_MATERIAL[type] || type];
  if (!texture) return false;
  ctx.imageSmoothingEnabled = false;
  let dy = 0;
  while (dy < height) {
    const sy = (((y + dy) % PERIOD) + PERIOD) % PERIOD,
      h = Math.min(height - dy, PERIOD - sy);
    let dx = 0;
    while (dx < width) {
      const sx = (((x + dx) % PERIOD) + PERIOD) % PERIOD,
        w = Math.min(width - dx, PERIOD - sx);
      ctx.drawImage(texture, sx, sy, w, h, x + dx, y + dy, w, h);
      dx += w;
    }
    dy += h;
  }
  return true;
}

function typeAt(map, x, y) {
  const col = Math.floor(x / TILE),
    row = Math.floor(y / TILE);
  return col >= 0 && col < MAP_WIDTH && row >= 0 && row < MAP_HEIGHT
    ? map.terrain[indexOf(col, row)]
    : -1;
}

// Only the visible grass/earth boundary changes. Both surfaces remain walkable.
export function visualGroundAt(map, x, y) {
  const original = typeAt(map, x, y);
  if (original !== 0 && original !== 1) return original;
  const col = Math.floor(x / TILE),
    row = Math.floor(y / TILE),
    other = original === 0 ? 1 : 0;
  let distance = Infinity;
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const nx = col + ox,
        ny = row + oy;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= MAP_WIDTH ||
        ny >= MAP_HEIGHT ||
        map.terrain[indexOf(nx, ny)] !== other
      )
        continue;
      const dx = Math.max(nx * TILE - x, 0, x - (nx + 1) * TILE),
        dy = Math.max(ny * TILE - y, 0, y - (ny + 1) * TILE);
      distance = Math.min(distance, Math.hypot(dx, dy));
    }
  if (distance > 9) return original;
  const wobble =
    Math.sin(x * 0.19) * 2.4 +
    Math.cos(y * 0.23) * 2 +
    Math.sin((x + y) * 0.071) * 2.3 +
    Math.sin((x - y) * 0.63) * 0.9;
  return (original === 1 ? distance : -distance) + wobble > 0 ? 1 : 0;
}

export function terrainEdgeRuns(map) {
  if (edgeCache.has(map)) return edgeCache.get(map);
  const runs = [];
  for (let y = 0; y < MAP_HEIGHT * TILE; y += 2) {
    let start = -1,
      type = -1;
    for (let x = 0; x <= MAP_WIDTH * TILE; x += 2) {
      const original = typeAt(map, x + 1, y + 1),
        visible = visualGroundAt(map, x + 1, y + 1);
      const current = x < MAP_WIDTH * TILE && visible !== original ? visible : -1;
      if (current !== type) {
        if (type !== -1) runs.push({ x: start, y, width: x - start, height: 2, type });
        start = x;
        type = current;
      }
    }
  }
  edgeCache.set(map, runs);
  return runs;
}

export function paintTerrainEdges(ctx, map, materials) {
  for (const run of terrainEdgeRuns(map)) {
    drawTerrainRect(ctx, materials, run.type, run.x, run.y, run.width, run.height);
    if (run.type === 0 && run.width >= 4) {
      ctx.fillStyle = '#345b3070';
      ctx.fillRect(run.x, run.y + 1, run.width, 1);
    }
  }
}
