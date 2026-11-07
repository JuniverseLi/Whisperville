import { placeText } from '../i18n.js';
import { TILE, MAP_WIDTH, MAP_HEIGHT, BUILDINGS, indexOf } from './map.js';
import { BUILDING_FRAMES, drawAtlas, drawEnvironmentProp } from './environment.js';
import { createOutdoorMap, drawTerrainRect, paintTerrainEdges, visualGroundAt } from './terrain.js';
import {
  paintPaving,
  paintGroundContacts,
  paintGroundFringe,
  paintShoreline,
} from './landscape.js';

const rect = (ctx, color, x, y, w, h) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
};
const dot = (ctx, color, x, y) => rect(ctx, color, x, y, 1, 1);
const seedAt = (x, y) =>
  ((Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263)) >>> 0) / 4294967296;

function tile(ctx, type, x, y, materials) {
  const px = x * TILE,
    py = y * TILE,
    r = seedAt(x, y);
  if (drawTerrainRect(ctx, materials, type, px, py, 16, 16)) return;
  if (type === 0) {
    rect(ctx, ['#83b34d', '#80af48', '#89b951'][Math.floor(r * 3)], px, py, 16, 16);
    for (let i = 0; i < 12; i++) {
      const dx = (i * 7 + x * 3) % 15,
        dy = (i * 5 + y * 3) % 15;
      rect(ctx, i % 3 ? '#94bf5b' : '#73a242', px + dx, py + dy, i % 3 === 0 ? 2 : 1, 1);
    }
    if (r > 0.87) {
      rect(ctx, '#78b047', px + 4, py + 11, 1, 3);
      dot(ctx, '#6ca344', px + 3, py + 10);
      dot(ctx, '#a9d971', px + 5, py + 10);
    }
  } else if (type === 1) {
    rect(ctx, r > 0.5 ? '#ddbd7e' : '#dfbf82', px, py, 16, 16);
    for (let i = 0; i < 9; i++)
      dot(
        ctx,
        i % 2 ? '#cda969' : '#ecd39b',
        px + ((i * 7 + x * 2) % 15),
        py + ((i * 3 + y * 4) % 15),
      );
  } else if (type === 2) {
    rect(ctx, '#449ab1', px, py, 16, 16);
    rect(ctx, '#5fb4c2', px + 2, py + 5, 5, 1);
    rect(ctx, '#92d2d2', px + 10, py + 12, 4, 1);
    rect(ctx, '#388ba5', px + 5, py + 9, 5, 1);
  } else if (type === 3) {
    rect(ctx, '#8c6747', px, py, 16, 16);
    rect(ctx, '#c49665', px + 1, py + 1, 14, 13);
    rect(ctx, '#dab17d', px + 2, py + 2, 12, 2);
    rect(ctx, '#a57952', px + 1, py + 13, 14, 1);
    dot(ctx, '#6e5038', px + 3, py + 7);
    dot(ctx, '#6e5038', px + 12, py + 7);
  } else if (type === 4) {
    rect(ctx, r > 0.5 ? '#c49a60' : '#cba36b', px, py, 16, 16);
    rect(ctx, '#a77b48', px, py + 15, 16, 1);
    rect(ctx, '#e2be83', px, py + 1, 16, 1);
    if ((x + y) % 3 === 0) rect(ctx, '#a77b48', px + (y % 2) * 8, py, 1, 16);
    rect(ctx, '#b58a52', px + 2, py + 7, 9, 1);
    rect(ctx, '#d6b37b', px + 6, py + 10, 8, 1);
    dot(ctx, '#986c40', px + 4, py + 8);
  } else if (type === 5) {
    rect(ctx, (x + y) % 2 ? '#d9d9bd' : '#ece4cb', px, py, 16, 16);
    rect(ctx, '#c6c7ae', px, py, 16, 1);
    rect(ctx, '#c6c7ae', px, py, 1, 16);
  } else if (type === 6) {
    rect(ctx, '#b3bab0', px, py, 16, 16);
    rect(ctx, '#9ba69f', px, py, 16, 1);
    rect(ctx, '#9ba69f', px + 8, py, 1, 16);
    dot(ctx, '#cbd1c2', px + 2, py + 3);
  } else if (type === 7) {
    rect(ctx, '#76563c', px, py, 16, 16);
    rect(ctx, '#e7cb92', px + 1, py + 2, 14, 12);
    rect(ctx, '#f5dfaa', px + 1, py + 2, 14, 2);
    rect(ctx, '#c0a16b', px + 1, py + 12, 14, 2);
  } else {
    rect(ctx, '#74553d', px, py, 16, 16);
    rect(ctx, '#a78056', px + 1, py + 1, 14, 14);
    rect(ctx, '#c2a074', px + 2, py + 2, 12, 3);
    rect(ctx, '#8a6646', px + 1, py + 13, 14, 2);
  }
}

function prop(ctx, p) {
  const x = p.x * TILE,
    y = p.y * TILE,
    w = p.w * TILE,
    h = p.h * TILE;
  if (p.kind === 'garden') {
    for (let col = 0; col < p.w; col++)
      for (let row = 0; row < p.h; row++) {
        const gx = x + col * 16,
          gy = y + row * 16;
        rect(ctx, '#a17849', gx + 1, gy + 2, 14, 12);
        rect(ctx, '#b98a51', gx + 2, gy + 3, 12, 2);
        rect(ctx, '#765e36', gx + 2, gy + 11, 12, 1);
        rect(ctx, '#4e8140', gx + 6, gy + 3, 3, 8);
        rect(ctx, '#6c9b48', gx + 3, gy + 4, 9, 4);
        rect(ctx, '#a0b36a', gx + 5, gy + 3, 4, 2);
      }
  } else if (p.kind === 'bunting') {
    for (let i = 0; i < w; i += 2) {
      const drop = Math.round(Math.sin((i / w) * Math.PI) * 7);
      rect(ctx, '#725239', x + i, y - 20 + drop, 2, 1);
    }
    for (let i = 6; i < w - 5; i += 17) {
      const drop = Math.round(Math.sin((i / w) * Math.PI) * 7),
        color = ['#c66e54', '#e6c16c', '#719b8b', '#cc94a1'][Math.floor(i / 17) % 4];
      rect(ctx, color, x + i, y - 19 + drop, 9, 3);
      rect(ctx, color, x + i + 1, y - 16 + drop, 7, 3);
      rect(ctx, color, x + i + 3, y - 13 + drop, 3, 3);
    }
  } else if (p.kind === 'shrub') {
    rect(ctx, '#426f39', x - 3, y + 2, 22, 12);
    rect(ctx, '#639447', x - 1, y - 1, 18, 13);
    rect(ctx, '#e7baab', x + 2, y + 2, 3, 3);
    rect(ctx, '#eed49b', x + 11, y + 6, 3, 3);
  } else if (p.kind === 'fence') {
    rect(ctx, '#a77b44', x, y + 3, w, 3);
    rect(ctx, '#d0a367', x, y + 2, w, 1);
    for (let i = 0; i < w; i += 12) {
      rect(ctx, '#805632', x + i, y - 2, 4, 17);
      rect(ctx, '#c99c5e', x + i, y - 3, 3, 16);
    }
  } else if (p.kind === 'crate') {
    rect(ctx, '#89603b', x, y - 4, w, h + 4);
    rect(ctx, '#bb9156', x + 1, y - 3, w - 2, h + 1);
    for (let i = 3; i < w; i += 8) {
      rect(ctx, '#765333', x + i, y, w ? 2 : 1, h - 2);
      rect(ctx, '#cf7951', x + i, y - 7, 5, 5);
    }
  } else if (p.kind === 'tree') {
    rect(ctx, '#5d924b55', x - 8, y + 7, 32, 7);
    rect(ctx, '#795639', x + 5, y - 4, 6, 18);
    rect(ctx, '#a47b4a', x + 7, y - 3, 2, 16);
    rect(ctx, '#6d4e35', x + 3, y + 12, 10, 3);
    const colors =
      p.color === 'autumn'
        ? ['#b6853d', '#d9ab45', '#edca5d', '#c69a3e']
        : ['#3b7c42', '#57974a', '#75b355', '#4b8a43'];
    // Stepped leaf clusters keep the silhouette round while every mark stays on the pixel grid.
    const widths = [10, 20, 28, 32, 36, 38, 38, 34, 28, 18];
    widths.forEach((size, row) => {
      rect(ctx, colors[0], x + 8 - size / 2, y - 34 + row * 3, size, 3);
      if (row > 0 && row < 9)
        rect(
          ctx,
          row > 6 ? colors[3] : colors[1],
          x + 10 - size / 2,
          y - 34 + row * 3,
          size - 4,
          3,
        );
    });
    for (let i = 0; i < 18; i++) {
      const dx = ((i * 7 + p.x * 3) % 24) - 7;
      const dy = ((i * 11 + p.y) % 20) - 29;
      rect(ctx, i % 3 ? colors[2] : colors[3], x + dx, y + dy, i % 2 ? 3 : 5, 2);
    }
    rect(ctx, colors[2], x + 1, y - 31, 8, 3);
    rect(ctx, colors[0], x + 8, y - 4, 7, 3);
  } else if (p.kind === 'wildflowers') {
    for (let i = 0; i < 3; i++) {
      let dx = i * 5 + 1,
        dy = ((i * 7) % 9) + 3;
      rect(ctx, '#6fa549', x + dx, y + dy, 1, 4);
      rect(ctx, p.color === 'pink' ? '#edb3b7' : '#f3d875', x + dx - 1, y + dy - 1, 3, 2);
      dot(ctx, '#fff3bd', x + dx, y + dy - 1);
    }
  } else if (p.kind === 'plant' || p.kind === 'flowers') {
    for (let col = 0; col < p.w; col++) {
      const px = x + col * 16;
      rect(ctx, '#a86f49', px + 4, y + 8, 9, 7);
      rect(ctx, '#c58b5c', px + 3, y + 7, 11, 3);
      rect(ctx, '#4f8648', px + 4, y + 2, 9, 7);
      rect(ctx, '#76a45d', px + 2, y + 3, 13, 3);
      if (p.kind === 'flowers') {
        rect(ctx, '#dda4ba', px + 4, y, 3, 3);
        rect(ctx, '#f2d780', px + 10, y + 2, 3, 3);
      } else rect(ctx, '#90bd6e', px + 6, y, 5, 5);
    }
  } else if (p.kind === 'rug') {
    rect(ctx, p.color || '#ad8f7e', x, y, w, h);
    ctx.strokeStyle = '#e8c68f';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    for (let i = 0; i < w; i += 4) {
      rect(ctx, '#e2c799', x + i, y - 1, 2, 1);
      rect(ctx, '#e2c799', x + i, y + h, 2, 1);
    }
    for (let ry = 5; ry < h - 4; ry += 8)
      for (let rx = 5; rx < w - 4; rx += 8) {
        dot(ctx, '#d7bd8e', x + rx, y + ry);
        dot(ctx, '#d7bd8e', x + rx + 1, y + ry + 1);
      }
  } else if (p.kind === 'counter') {
    rect(ctx, '#77513b', x, y, w, h);
    rect(ctx, '#c08b56', x + 1, y + 1, w - 2, h - 3);
    rect(ctx, '#ead2a1', x, y - 3, w, 6);
    rect(ctx, '#f7e5b8', x + 1, y - 3, w - 2, 1);
    for (let i = 4; i < w; i += 16) {
      rect(ctx, '#8a5d3d', x + i, y + 6, 10, 1);
      dot(ctx, '#e5bd7d', x + i + 5, y + 9);
    }
  } else if (p.kind === 'coffee') {
    rect(ctx, '#514a3e', x + 2, y - 7, 12, 9);
    rect(ctx, '#aeb5ab', x + 4, y - 9, 8, 4);
    rect(ctx, '#e9d5a4', x + 6, y - 2, 4, 3);
    dot(ctx, '#ecb261', x + 3, y - 5);
  } else if (p.kind === 'table' || p.kind === 'desk') {
    rect(ctx, '#775039', x + 3, y + h - 3, w - 6, 5);
    rect(ctx, '#b57e4e', x, y - 2, w, h - 2);
    rect(ctx, '#dbaf72', x + 1, y - 4, w - 2, h - 2);
    rect(ctx, '#e8c991', x + 2, y - 4, w - 4, 2);
    if (p.kind === 'desk') {
      rect(ctx, '#f1e6bd', x + 4, y, 9, 7);
      rect(ctx, '#a7b9b3', x + 5, y + 1, 7, 1);
    } else {
      rect(ctx, '#e8e4bd', x + w / 2 - 3, y + h / 2 - 5, 6, 5);
      rect(ctx, '#6d8a61', x + w / 2 - 1, y + h / 2 - 10, 2, 6);
      rect(ctx, '#dba4a1', x + w / 2 - 3, y + h / 2 - 12, 6, 4);
    }
  } else if (p.kind === 'shelf') {
    rect(ctx, '#715139', x, y - 6, w, h + 6);
    rect(ctx, '#bc915c', x + 1, y - 5, w - 2, h + 3);
    for (let row = 0; row < p.h; row++) {
      rect(ctx, '#745039', x + 2, y + row * 16 - 3, w - 4, 13);
      for (let col = 0; col < p.w * 4 - 1; col++)
        rect(
          ctx,
          ['#ad7666', '#7b9c8e', '#d5bc74', '#8797ae'][col % 4],
          x + 3 + col * 4,
          y + row * 16 - 2,
          3,
          9,
        );
      rect(ctx, '#dfbd86', x + 1, y + row * 16 + 10, w - 2, 2);
    }
  } else if (p.kind === 'board') {
    rect(ctx, '#825b3b', x, y - 8, w, 21);
    rect(ctx, '#4c7260', x + 2, y - 6, w - 4, 16);
    rect(ctx, '#c9d7b1', x + 8, y, 23, 1);
    rect(ctx, '#c9d7b1', x + 8, y + 4, 38, 1);
    rect(ctx, '#e4d8b4', x + w - 16, y + 9, 8, 2);
  } else if (p.kind === 'bed') {
    rect(ctx, '#805a3e', x, y - 4, w, h + 4);
    rect(ctx, '#dfcc9b', x + 2, y - 3, w - 4, h);
    rect(ctx, '#ede4c5', x + 4, y, w - 8, 9);
    rect(ctx, '#a292b0', x + 2, y + 12, w - 4, h - 13);
    rect(ctx, '#c0b2cc', x + 3, y + 14, w - 6, 3);
  } else if (p.kind === 'fountain') {
    rect(ctx, '#84938b', x, y, w, h);
    rect(ctx, '#c3c9b1', x + 2, y + 1, w - 4, h - 3);
    rect(ctx, '#74b7bc', x + 6, y + 5, w - 12, h - 11);
    rect(ctx, '#b6d9cd', x + 10, y + 9, w - 20, 2);
    rect(ctx, '#87988d', x + w / 2 - 4, y + 7, 8, 17);
    rect(ctx, '#d8dbc3', x + w / 2 - 6, y + 5, 12, 4);
    rect(ctx, '#9bc6be', x + w / 2 - 2, y + 1, 4, 5);
  } else if (p.kind === 'bench') {
    rect(ctx, '#73543a', x + 2, y + 10, w - 4, 5);
    rect(ctx, '#c6985f', x, y + 2, w, 7);
    rect(ctx, '#ddb77b', x, y + 1, w, 2);
    rect(ctx, '#8d6741', x + 3, y + 14, 3, 3);
    rect(ctx, '#8d6741', x + w - 6, y + 14, 3, 3);
  } else if (p.kind === 'lamp') {
    rect(ctx, '#68604a', x + 7, y - 17, 2, 32);
    rect(ctx, '#6b5c42', x + 3, y - 21, 10, 9);
    rect(ctx, '#e9d9a0', x + 4, y - 20, 8, 6);
    rect(ctx, '#fff1ba', x + 6, y - 20, 4, 6);
    rect(ctx, '#58644b', x + 5, y + 13, 6, 3);
  } else if (p.kind === 'stone') {
    rect(ctx, '#919f87', x + 2, y + 6, 12, 8);
    rect(ctx, '#bac2a7', x + 3, y + 4, 9, 7);
    rect(ctx, '#d3d4b9', x + 4, y + 4, 5, 2);
  } else if (p.kind === 'mailbox') {
    rect(ctx, '#77583d', x + 7, y + 4, 2, 12);
    rect(ctx, '#a75644', x + 2, y - 5, 12, 12);
    rect(ctx, '#cb8065', x + 3, y - 5, 10, 3);
    rect(ctx, '#6e4934', x + 4, y, 7, 2);
  } else if (p.kind === 'bicycle') {
    ctx.strokeStyle = '#5c6964';
    ctx.lineWidth = 2;
    for (const dx of [4, w - 5]) {
      ctx.beginPath();
      ctx.arc(x + dx, y + h - 5, 5, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.strokeStyle = '#a36e4f';
    ctx.beginPath();
    ctx.moveTo(x + 4, y + h - 5);
    ctx.lineTo(x + w / 2, y + 2);
    ctx.lineTo(x + w - 5, y + h - 5);
    ctx.lineTo(x + 4, y + h - 5);
    ctx.stroke();
    rect(ctx, '#596359', x + w / 2 - 3, y - 1, 7, 2);
  } else if (p.kind === 'press') {
    rect(ctx, '#606d69', x, y - 4, w, h + 4);
    rect(ctx, '#89948a', x + 2, y - 3, w - 4, h - 1);
    rect(ctx, '#424e4a', x + 5, y + 2, w - 10, 10);
    rect(ctx, '#e6dfbd', x + 12, y + 11, w - 24, 12);
    for (let i = 0; i < 3; i++) rect(ctx, '#a7aa91', x + 15, y + 14 + i * 3, w - 30, 1);
  } else if (p.kind === 'tools') {
    rect(ctx, '#946b46', x, y - 6, w, 14);
    for (let i = 4; i < w; i += 10) {
      rect(ctx, '#b9bca4', x + i, y - 4, 2, 8);
      rect(ctx, '#d0ba7c', x + i - 1, y + 2, 4, 5);
    }
  }
}

export function paintOutdoorGround(map, materials) {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH * TILE;
  canvas.height = MAP_HEIGHT * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const outdoor = createOutdoorMap(map);
  const surface = { ...outdoor, terrain: outdoor.terrain.map((type) => (type === 6 ? 1 : type)) };
  for (let y = 0; y < MAP_HEIGHT; y++)
    for (let x = 0; x < MAP_WIDTH; x++) tile(ctx, surface.terrain[indexOf(x, y)], x, y, materials);
  if (materials) {
    paintTerrainEdges(ctx, surface, materials);
    paintGroundFringe(ctx, surface, visualGroundAt);
    paintPaving(ctx, outdoor);
    paintShoreline(ctx, outdoor, (type, x, y, w, h) =>
      drawTerrainRect(ctx, materials, type, x, y, w, h),
    );
  }
  paintGroundContacts(ctx, map);
  return canvas;
}

export function paintMap(
  map,
  materials,
  ground = paintOutdoorGround(map, materials),
  language = 'zh',
) {
  const canvas = document.createElement('canvas');
  canvas.width = MAP_WIDTH * TILE;
  canvas.height = MAP_HEIGHT * TILE;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(ground, 0, 0);
  for (const building of map.buildings || BUILDINGS) {
    for (let y = building.y; y < building.y + building.h; y++) {
      for (let x = building.x; x < building.x + building.w; x++) {
        tile(ctx, map.terrain[indexOf(x, y)], x, y, materials);
      }
    }
  }
  // Break up the straight paths with grass edges, pebbles and riverbank reeds.
  for (let y = 1; y < MAP_HEIGHT - 1; y++)
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      const kind = map.terrain[indexOf(x, y)];
      if (kind === 1 && !materials) {
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ])
          if (map.terrain[indexOf(x + dx, y + dy)] === 0) {
            const px = x * TILE + (dx === 1 ? 15 : dx === -1 ? 0 : 4 + (y % 3) * 3),
              py = y * TILE + (dy === 1 ? 15 : dy === -1 ? 0 : 4 + (x % 3) * 3);
            rect(ctx, '#a6c779', px, py, dx ? 1 : 4, dy ? 1 : 4);
            if ((x + y) % 3 === 0) rect(ctx, '#c1ba80', px - 1, py - 1, 2, 2);
          }
      }
      if (kind === 2 && (x === 46 || x === 49) && !materials) {
        rect(ctx, '#508e82', x * TILE + (x === 46 ? 0 : 14), y * TILE, 2, 16);
        if (y % 4 === 0) {
          rect(ctx, '#6ba062', x * TILE + (x === 46 ? -3 : 17), y * TILE + 3, 1, 9);
          rect(ctx, '#87af67', x * TILE + (x === 46 ? -5 : 19), y * TILE + 1, 1, 12);
        }
      }
    }
  for (const b of BUILDINGS) {
    rect(ctx, b.color, b.x * TILE, b.y * TILE - 4, b.w * TILE, 4);
    for (let x = b.x + 2; x < b.x + b.w - 2; x += 4) {
      rect(ctx, '#6e785e', x * TILE, b.y * TILE + 2, 24, 9);
      rect(ctx, '#b4d1bd', x * TILE + 2, b.y * TILE + 3, 20, 6);
      rect(ctx, '#e9d9a9', x * TILE + 11, b.y * TILE + 3, 2, 6);
    }
  }
  // Bridge rails, lily pads and stone riverbanks give the river a readable edge.
  for (const [top, bottom] of [
    [18, 22],
    [34, 37],
  ]) {
    for (const row of [top, bottom]) {
      rect(ctx, '#785738', 46 * TILE - 3, row * TILE - 3, 4 * TILE + 6, 3);
      rect(ctx, '#d7ad70', 46 * TILE - 3, row * TILE - 4, 4 * TILE + 6, 1);
      for (const col of [46, 48, 50]) {
        rect(ctx, '#725033', col * TILE - 2, row * TILE - 9, 4, 11);
        rect(ctx, '#c39860', col * TILE - 2, row * TILE - 10, 4, 3);
      }
    }
  }
  for (const y of [5, 12, 25, 31, 42, 46]) {
    const px = (y % 2 ? 46 : 49) * TILE + 3,
      py = y * TILE + 6;
    rect(ctx, '#347b67', px, py, 10, 5);
    rect(ctx, '#83aa63', px + 1, py - 1, 8, 4);
    rect(ctx, '#a8bc73', px + 2, py, 3, 1);
    rect(ctx, '#ddb6b7', px + 4, py - 3, 3, 3);
  }
  map.props
    .filter((p) => ['rug', 'garden', 'wildflowers'].includes(p.kind))
    .forEach((p) => prop(ctx, p));
  // Small wooden signs identify places without covering their interiors.
  for (const b of BUILDINGS) {
    ctx.font = '8px Microsoft YaHei,sans-serif';
    const label = placeText(b.id, language);
    const labelWidth = Math.ceil(ctx.measureText(label).width) + 12,
      sx = b.x * TILE + 3,
      sy = (b.y + b.h) * TILE + 5;
    rect(ctx, '#6c5034', sx + 2, sy + 2, labelWidth, 14);
    rect(ctx, '#d4b17a', sx, sy, labelWidth, 13);
    rect(ctx, '#f0d4a0', sx + 1, sy + 1, labelWidth - 2, 1);
    ctx.font = '8px "Microsoft YaHei",sans-serif';
    ctx.fillStyle = '#6a5034';
    ctx.textBaseline = 'top';
    ctx.fillText(label, sx + 6, sy + 3);
  }
  return canvas;
}

export function drawProp(ctx, p, atlas) {
  if (p.kind === 'counter' && p.w >= 6 && atlas) prop(ctx, p);
  if (!drawEnvironmentProp(ctx, p, atlas)) prop(ctx, p);
}

export function paintRoofBacking(building, ground) {
  const canvas = document.createElement('canvas');
  canvas.width = building.w * TILE;
  canvas.height = building.h * TILE + 16;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  // Copy the exact outdoor pixels, including dirt/grass edge masks, rather than a grass rectangle.
  ctx.drawImage(
    ground,
    building.x * TILE,
    building.y * TILE - 16,
    canvas.width,
    canvas.height,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  return canvas;
}

export function paintRoof(building, atlas) {
  const canvas = document.createElement('canvas');
  canvas.width = building.w * TILE;
  canvas.height = building.h * TILE + 16;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  drawAtlas(ctx, atlas, BUILDING_FRAMES[building.id], 0, 0, canvas.width, canvas.height - 3);
  return canvas;
}

export function drawSprite(ctx, image, id, x, y, direction, walking, time, selected = false) {
  rect(ctx, '#395d452f', x - 8, y - 2, 16, 5);
  if (selected) {
    ctx.strokeStyle = '#f5d76d';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(x - 10), Math.round(y - 3), 20, 5);
  }
  if (!image) return;
  const column = walking ? [0, 1, 2, 1][Math.floor(time * 8) % 4] : 1,
    row = direction;
  const sw = image.width / 3,
    sh = image.height / 4;
  ctx.drawImage(
    image,
    column * sw,
    row * sh,
    sw,
    sh,
    Math.round(x - 23),
    Math.round(y - 43),
    46,
    46,
  );
}

export function drawSpeech(ctx, text, x, y) {
  const lines = [];
  let line = '';
  for (const char of text.slice(0, 65)) {
    line += char;
    if (line.length >= 14) {
      lines.push(line);
      line = '';
    }
  }
  if (line) lines.push(line);
  const width = Math.min(178, Math.max(60, ...lines.map((item) => item.length * 10 + 14))),
    height = lines.length * 14 + 12;
  rect(ctx, '#59462f', x - width / 2 + 2, y - height + 2, width, height);
  rect(ctx, '#fff9df', x - width / 2, y - height, width, height);
  ctx.strokeStyle = '#a48c5d';
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.round(x - width / 2), Math.round(y - height), width, height);
  rect(ctx, '#fff9df', x - 2, y, 5, 4);
  ctx.font = '10px "Microsoft YaHei",sans-serif';
  ctx.fillStyle = '#5b513e';
  ctx.textBaseline = 'top';
  lines.forEach((item, index) =>
    ctx.fillText(item, x - width / 2 + 7, y - height + 6 + index * 14),
  );
}
