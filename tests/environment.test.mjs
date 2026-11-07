import test from 'node:test';
import assert from 'node:assert/strict';
import { roofOpacity, drawAtlas } from '../src/game/environment.js';
import { BUILDINGS, TILE } from '../src/game/map.js';

test('building exteriors remain visible in the street, reveal entrances and always uncover the player indoors', () => {
  const cafe = BUILDINGS.find((b) => b.id === 'cafe');
  const at = (x, y) => ({ x: x * TILE, y: y * TILE });
  assert.equal(roofOpacity(cafe, at(23.5, 30.5)), 1);
  assert.equal(roofOpacity(cafe, at(16.5, 26.5)), 0);
  assert.equal(roofOpacity(cafe, at(15, 34)), 0);
  assert.ok(roofOpacity(cafe, at(15, 36)) > 0 && roofOpacity(cafe, at(15, 36)) < 1);
  assert.equal(roofOpacity(cafe, at(23.5, 30.5), true), 0);
});

test('environment sprites retain one pixel per world pixel without a smoothed half-size intermediate', (t) => {
  const sprites = [],
    draws = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'document');
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement() {
        const context = {
          imageSmoothingEnabled: true,
          drawImage() {
            assert.equal(this.imageSmoothingEnabled, false);
          },
        };
        const sprite = { width: 0, height: 0, getContext: () => context };
        sprites.push(sprite);
        return sprite;
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'document', previous);
    else delete globalThis.document;
  });
  const atlas = {
    image: { width: 440, height: 440 },
    frames: [{ x: 0, y: 0, w: 440, h: 440 }],
    cache: new Map(),
  };
  const context = {
    imageSmoothingEnabled: true,
    drawImage(...args) {
      draws.push(args);
    },
  };
  drawAtlas(context, atlas, 0, 3, 5, 240, 173);
  drawAtlas(context, atlas, 0, 3, 5, 240, 173);
  assert.equal(sprites.length, 1);
  assert.equal(sprites[0].width, 240);
  assert.equal(sprites[0].height, 173);
  assert.equal(context.imageSmoothingEnabled, false);
  assert.deepEqual(draws[0].slice(1), [3, 5, 240, 173]);
});
