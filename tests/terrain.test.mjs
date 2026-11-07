import test from 'node:test';
import assert from 'node:assert/strict';
import { createMap, TILE, MAP_WIDTH, BUILDINGS, indexOf } from '../src/game/map.js';
import { createOutdoorMap, visualGroundAt, terrainEdgeRuns } from '../src/game/terrain.js';

test('natural ground transitions change only walkable grass and path visuals', () => {
  const map = createMap(),
    before = map.terrain.slice(),
    collisions = map.solid.slice();
  const runs = terrainEdgeRuns(map);
  assert.ok(runs.length > 200);
  for (const run of runs)
    for (let x = run.x; x < run.x + run.width; x += 2) {
      const original =
        map.terrain[indexOf(Math.floor((x + 1) / TILE), Math.floor((run.y + 1) / TILE))];
      assert.ok([0, 1].includes(original));
      assert.ok([0, 1].includes(run.type));
      assert.notEqual(run.type, original);
    }
  assert.deepEqual(map.terrain, before);
  assert.deepEqual(map.solid, collisions);
  assert.strictEqual(terrainEdgeRuns(map), runs);
});
test('water, bridges, floors and walls keep their visible footprint; edge variation is deterministic', () => {
  const map = createMap();
  for (let i = 0; i < map.terrain.length; i++) {
    const x = (i % MAP_WIDTH) * TILE + 8,
      y = Math.floor(i / MAP_WIDTH) * TILE + 8;
    if (map.terrain[i] >= 2) assert.equal(visualGroundAt(map, x, y), map.terrain[i]);
  }
  const other = createMap();
  assert.deepEqual(terrainEdgeRuns(map), terrainEdgeRuns(other));
});

test('the outdoor backing preserves adjacent roads and shares the global edge mask without modifying interiors', () => {
  const map = createMap(),
    before = map.terrain.slice(),
    outdoor = createOutdoorMap(map);
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++) {
      const inside = BUILDINGS.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h);
      assert.equal(outdoor.terrain[indexOf(x, y)], inside ? 0 : map.terrain[indexOf(x, y)]);
    }
  const post = BUILDINGS.find((b) => b.id === 'post');
  assert.equal(outdoor.terrain[indexOf(post.x, post.y - 1)], 1);
  assert.equal(visualGroundAt(outdoor, post.x * TILE + 8, (post.y - 1) * TILE + 4), 1);
  assert.deepEqual(map.terrain, before);
  assert.strictEqual(outdoor.solid, map.solid);
});
