import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, planTurn, advanceTurn, validateGame } from '../src/simulation/engine.js';
import {
  createVillage,
  findRoute,
  sampleRoute,
  planActivities,
  finishActivities,
  validVillage,
} from '../src/simulation/village.js';

test('walk routes start and end at the actual positions and cross the configured bridge', () => {
  const route = findRoute([755, 360], [260, 350]);
  assert.deepEqual(sampleRoute(route, 0), [755, 360]);
  assert.deepEqual(sampleRoute(route, 1), [260, 350]);
  assert.ok(route.some(([x, y]) => x === 605 && y === 235));
  assert.ok(route.some(([x, y]) => x === 535 && y === 245));
  assert.deepEqual(
    sampleRoute(
      [
        [1, 1],
        [1, 1],
      ],
      0.5,
    ),
    [1, 1],
  );
});

test('a resident never participates in two simultaneous conversations', () => {
  let game = createGame();
  for (let step = 0; step < 12; step++) {
    const people = planTurn(game).flatMap(({ sender, receiver }) => [sender, receiver]);
    assert.equal(new Set(people).size, people.length);
    game = advanceTurn(game);
  }
});

test('planned meetings and committed positions agree without mutating the current village', () => {
  const game = createGame();
  const before = structuredClone(game);
  const contacts = planTurn(game);
  const activities = planActivities(game, contacts);
  const next = advanceTurn(game);
  assert.deepEqual(game, before);
  assert.deepEqual(next.village, finishActivities(activities));
  for (const contact of contacts) {
    assert.equal(activities[contact.sender].partner, contact.receiver);
    assert.equal(activities[contact.receiver].partner, contact.sender);
    assert.equal(
      next.messages.find(
        ({ sender, receiver, round }) =>
          round === 1 && sender === contact.sender && receiver === contact.receiver,
      ).meeting.place,
      activities[contact.sender].place,
    );
  }
  assert.equal(validateGame(next), true);
});

test('old saves remain valid and acquire village state on their next segment', () => {
  const old = createGame();
  delete old.village;
  assert.equal(validateGame(old), true);
  assert.equal(validVillage(advanceTurn(old).village), true);
  const corrupt = createGame();
  corrupt.village.lin.position = [Infinity, 1];
  assert.equal(validateGame(corrupt), false);
  assert.equal(validVillage(createVillage()), true);
  const brokenMeeting = advanceTurn(createGame());
  brokenMeeting.messages.at(-1).meeting.sender = 'invalid-position';
  assert.equal(validateGame(brokenMeeting), false);
});
