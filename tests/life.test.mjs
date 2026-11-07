import test from 'node:test';
import assert from 'node:assert/strict';
import {
  demoIntentions,
  validIntentions,
  lifeContext,
  validLifeContext,
} from '../src/simulation/life.js';
import { createExploreGame } from '../src/game/session.js';
import { planTurn, advanceTurn, validateGame } from '../src/simulation/engine.js';

test('intentions choose actual contacts while preserving non-overlap and source provenance', () => {
  const game = createExploreGame();
  game.observer = true;
  const intentions = demoIntentions(game).map((p) => ({ ...p, talkTo: null }));
  intentions.find((p) => p.id === 'lin').talkTo = 'xu';
  assert.ok(validIntentions(intentions));
  const plans = planTurn(game, intentions);
  assert.equal(plans.length, 1);
  assert.equal(plans[0].receiver, 'xu');
  const next = advanceTurn(game, [], intentions);
  assert.equal(next.messages.at(-1).receiver, 'xu');
  assert.equal(next.messages.at(-1).parentId, 'm0');
  assert.ok(validateGame(next));
  assert.equal(
    planTurn(
      game,
      intentions.map((p) => ({ ...p, talkTo: null })),
    ).length,
    0,
  );
});
test('life context contains each residents own observed messages, and rejects unsafe model actions', () => {
  const game = createExploreGame(),
    context = lifeContext(game);
  assert.ok(validLifeContext(context));
  assert.equal(context.find((p) => p.id === 'zhou').memories.length, 0);
  assert.ok(context.find((p) => p.id === 'qiao').memories[0].includes('正常上课'));
  assert.equal(JSON.stringify(context.find((p) => p.id === 'lin')).includes('正常上课'), false);
  const intentions = demoIntentions(game);
  assert.ok(validIntentions(intentions));
  assert.equal(validIntentions(intentions.slice(1)), false);
  assert.equal(validIntentions(intentions.map((p) => ({ ...p, place: 'unknown' }))), false);
  assert.equal(validIntentions(intentions.map((p) => ({ ...p, talkTo: p.id }))), false);
  assert.equal(
    validLifeContext(context.map((p) => ({ ...p, memories: ['x'.repeat(161)] }))),
    false,
  );
});
