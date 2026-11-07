import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, indexOf, TILE } from '../src/game/map.js';
import { createOutdoorMap } from '../src/game/terrain.js';
import { pavingStones, cleanPixelClusters, shorelineSegments } from '../src/game/landscape.js';

test('outdoor paving is made of individual small slabs with broken edges and retains navigable terrain', () => {
  const original = createMap(),
    map = createOutdoorMap(original),
    before = original.solid.slice();
  const stones = pavingStones(map);
  assert.ok(stones.length > 25);
  assert.deepEqual(stones, pavingStones(map));
  for (const stone of stones) {
    assert.equal(map.terrain[indexOf(Math.floor(stone.x / TILE), Math.floor(stone.y / TILE))], 6);
    assert.ok(stone.w < TILE && stone.h < TILE);
  }
  assert.ok(stones.some((s) => s.x < 560) && stones.some((s) => s.x > 700));
  assert.deepEqual(original.solid, before);
});

test('palette cleanup removes isolated bright flecks but preserves dark outlines and transparent edges', () => {
  const data = new Uint8ClampedArray(5 * 5 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([173, 125, 72, 255], i);
  data.set([255, 240, 197, 255], (2 * 5 + 2) * 4);
  cleanPixelClusters(data, 5, 5);
  assert.deepEqual([...data.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)], [173, 125, 72, 255]);
  data.set([48, 59, 45, 255], (2 * 5 + 2) * 4);
  data.set([0, 0, 0, 0], 0);
  cleanPixelClusters(data, 5, 5);
  assert.deepEqual([...data.slice((2 * 5 + 2) * 4, (2 * 5 + 2) * 4 + 4)], [48, 59, 45, 255]);
  assert.equal(data[3], 0);
});

test('natural riverbanks vary along water but leave both bridge crossings open', () => {
  const map = createMap(),
    segments = shorelineSegments(map);
  assert.ok(segments.length > 250);
  assert.ok(new Set(segments.map((s) => s.left)).size > 3);
  for (const segment of segments) {
    assert.equal(map.terrain[indexOf(46, Math.floor(segment.y / TILE))], 2);
    assert.ok(segment.left + segment.right < 32);
  }
  assert.equal(
    segments.some((s) => s.y >= 18 * TILE && s.y < 22 * TILE),
    false,
  );
  assert.equal(
    segments.some((s) => s.y >= 34 * TILE && s.y < 37 * TILE),
    false,
  );
});
