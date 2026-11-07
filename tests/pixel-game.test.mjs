import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createMap,
  NPC_HOMES,
  PUBLIC_SPOTS,
  SPAWN,
  BUILDINGS,
  isWalkable,
  findPath,
  interactionPath,
  indexOf,
  canTalk,
} from '../src/game/map.js';
import { createExploreGame, createPlayer, currentQuest, validPlayer } from '../src/game/session.js';
import { replyToPlayer } from '../src/game/dialogue.js';
import { validateGame, intervene, advanceTurn, getStats } from '../src/simulation/engine.js';

test('all homes and routine destinations are walkable and reachable through doors', () => {
  const map = createMap();
  for (const point of [...Object.values(NPC_HOMES), ...PUBLIC_SPOTS]) {
    assert.ok(isWalkable(map, ...point), `blocked destination: ${point}`);
    const path = findPath(map, SPAWN, point);
    assert.ok(path.length > 0, `unreachable destination: ${point}`);
    assert.deepEqual(path.at(-1), point);
    let previous = SPAWN;
    for (const tile of path) {
      assert.ok(isWalkable(map, ...tile));
      assert.equal(Math.abs(tile[0] - previous[0]) + Math.abs(tile[1] - previous[1]), 1);
      previous = tile;
    }
  }
});
test('walls, furniture and water block movement; routes enter through doorways and cross bridges', () => {
  const map = createMap();
  assert.equal(isWalkable(map, 46, 25), false);
  assert.equal(isWalkable(map, 47, 19), true);
  assert.equal(isWalkable(map, 10, 24), false); // Café counter.
  assert.equal(isWalkable(map, 7, 26), false); // Café wall.
  const cafe = BUILDINGS.find((b) => b.id === 'cafe');
  const path = findPath(map, SPAWN, NPC_HOMES.lin);
  assert.ok(path.some(([x, y]) => y === cafe.y + cafe.h - 1 && (x === 14 || x === 15)));
  const route = findPath(map, SPAWN, NPC_HOMES.qiao);
  assert.ok(route.some(([x, y]) => x >= 46 && x <= 49 && map.terrain[indexOf(x, y)] === 3));
  assert.deepEqual(findPath(map, SPAWN, [46, 25]), []);
  assert.deepEqual(findPath(map, SPAWN, [-1, 4]), []);
  assert.equal(interactionPath(map, SPAWN, [-10, -10]), null);
});
test('NPC approach paths stop adjacent to people instead of walking into furniture', () => {
  const map = createMap();
  for (const home of Object.values(NPC_HOMES)) {
    const approach = interactionPath(map, SPAWN, home);
    assert.ok(approach);
    assert.equal(
      Math.abs(approach.target[0] - home[0]) + Math.abs(approach.target[1] - home[1]),
      1,
    );
    assert.ok(approach.path.every((tile) => isWalkable(map, ...tile)));
  }
});
test('nearby residents can be approached, but cannot be spoken to through a wall', () => {
  const map = createMap();
  assert.equal(canTalk(map, [16.5, 26.5], [16.5, 27.5]), true);
  assert.equal(canTalk(map, [20.5, 26.5], [22.2, 26.5]), false);
  assert.equal(canTalk(map, [14.5, 31.5], [14.5, 33.2]), true);
});
test('exploration starts with a real teacher source, and preserves provenance across long saves', () => {
  let game = createExploreGame();
  assert.ok(validateGame(game));
  assert.equal(game.residents.qiao.verified, true);
  assert.equal(game.residents.lin.verified, false);
  assert.equal(game.remaining, 3);
  const source = game.messages.find((m) => m.id === game.residents.qiao.messageId);
  assert.equal(source.sender, 'notice');
  assert.equal(source.parentId, null);
  for (let i = 0; i < 72; i++) game = advanceTurn(game);
  assert.ok(validateGame(JSON.parse(JSON.stringify(game))));
  assert.ok(getStats(game).corrected >= 1);
});
test('quest progresses only after greeting, receiving the notice, and sharing it', () => {
  const game = createExploreGame(),
    player = createPlayer(game.id);
  assert.equal(currentQuest(player).target, 'lin');
  const greeting = replyToPlayer(game, 'lin', 'greet', player);
  player.talkedLin = greeting.talkedLin;
  assert.equal(currentQuest(player).target, 'qiao');
  assert.equal(replyToPlayer(game, 'lin', 'school', player).hasNotice, undefined);
  assert.equal(replyToPlayer(game, 'mei', 'share', player).intervene, undefined);
  player.hasNotice = replyToPlayer(game, 'qiao', 'school', player).hasNotice;
  assert.equal(currentQuest(player).target, 'mei');
  const reply = replyToPlayer(game, 'mei', 'share', player);
  assert.equal(reply.intervene, true);
  const next = intervene(game, reply.shared, 'evidence');
  assert.equal(next.residents.mei.verified, true);
  assert.equal(next.remaining, 2);
  player.shared.push(reply.shared);
  assert.equal(currentQuest(player).target, null);
  assert.equal(replyToPlayer(next, 'mei', 'share', player).intervene, undefined);
  assert.equal(replyToPlayer({ ...game, remaining: 0 }, 'mei', 'share', player).shared, undefined);
});
test('player save validation rejects stale sessions, invalid positions and corrupt journal entries', () => {
  const player = createPlayer('one');
  assert.ok(validPlayer(player, 'one'));
  assert.equal(validPlayer(player, 'two'), false);
  assert.equal(validPlayer({ ...player, x: NaN }, 'one'), false);
  assert.equal(validPlayer({ ...player, y: 99999 }, 'one'), false);
  assert.equal(validPlayer({ ...player, journal: [{ id: 'x', text: {} }] }, 'one'), false);
  assert.equal(validPlayer({ ...player, visited: ['unknown'] }, 'one'), false);
});
test('a player can still share a remaining notice after exploration propagation stops', () => {
  const game = createExploreGame();
  game.round = 72;
  const next = intervene(game, 'mei', 'evidence');
  assert.equal(next.residents.mei.verified, true);
  assert.equal(next.remaining, 2);
});
