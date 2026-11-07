import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIOS, getScenario } from '../src/simulation/scenarios.js';
import { createExploreGame } from '../src/game/session.js';
import {
  advanceTurn,
  intervene,
  validateGame,
  planTurn,
  toModelConversations,
} from '../src/simulation/engine.js';
import { demoIntentions, recordStoryProgress, lifeContext } from '../src/simulation/life.js';
import { seedMinds, updateMinds, validMinds } from '../src/simulation/memory.js';
import { BUILDINGS } from '../src/game/map.js';
import { claimText } from '../src/i18n.js';
import { validConversations } from '../server/model.mjs';

test('all four stories have distinct valid seeds and localized claim meanings', () => {
  assert.equal(SCENARIOS.length, 4);
  for (const scene of SCENARIOS) {
    const game = createExploreGame(42, scene.id);
    game.minds = seedMinds(game);
    game.intentions = demoIntentions(game);
    assert.equal(getScenario(game).id, scene.id);
    assert.ok(validateGame(game));
    assert.ok(validMinds(game.minds, game));
    for (const m of game.messages) {
      assert.match(
        m.text,
        new RegExp(
          scene.id === 'school-closure' ? '学校' : scene.id === 'spring-party' ? '茶会' : '栗子',
        ),
      );
      assert.ok(m.textEn);
    }
    for (let claim = 0; claim < scene.claims.length; claim++)
      assert.equal(claimText(claim, 'en', game), scene.claimsEn[claim]);
    assert.equal(game.residents.qiao.verified, scene.id === 'school-closure');
  }
});

test('free living produces casual encounters and memories without introducing a scenario rumor', () => {
  let game = createExploreGame(42, 'free-day');
  game.observer = true;
  game.minds = seedMinds(game);
  for (let i = 0; i < 12; i++) {
    const intentions = demoIntentions(game),
      next = advanceTurn(game, [], intentions);
    next.minds = updateMinds(game, next);
    assert.ok(validateGame(next));
    assert.ok(validMinds(next.minds, next));
    game = next;
  }
  assert.equal(game.messages.length, 0);
  assert.ok(game.encounters.length > 0);
  assert.ok(Object.values(game.residents).every((p) => p.claim === null));
  assert.equal(intervene(game, 'lin'), game);
  assert.ok(lifeContext(game).every((p) => p.memories.every((m) => !m.includes('停课'))));
});

test('a tea invitation changes destinations, but arrival requires a real café position after the start', () => {
  let game = createExploreGame(42, 'spring-party');
  game = intervene(game, 'ada');
  game.round = 2;
  assert.equal(demoIntentions(game).find((p) => p.id === 'ada').place, 'cafe');
  const café = BUILDINGS.find((b) => b.id === 'cafe'),
    position = { x: (café.home[0] + 0.5) * 16, y: (café.home[1] + 0.5) * 16 };
  assert.deepEqual(recordStoryProgress(game, { actors: { ada: position } }).arrivals, []);
  game.round = 3;
  assert.deepEqual(recordStoryProgress(game, { actors: { ada: { x: 40, y: 40 } } }).arrivals, []);
  const progress = recordStoryProgress(game, { actors: { ada: position, mia: position } });
  assert.deepEqual(progress.arrivals, [{ id: 'ada', round: 3 }]);
  game.storyProgress = progress;
  assert.deepEqual(recordStoryProgress(game, { actors: { ada: position } }), progress);
});

test('a missing-cat clue changes the search route without granting uninformed residents the answer', () => {
  let game = createExploreGame(42, 'lost-cat');
  game.round = 1;
  assert.equal(demoIntentions(game).find((p) => p.id === 'lin').place, 'river');
  assert.equal(demoIntentions(game).find((p) => p.id === 'zhou').place, 'florist');
  assert.equal(lifeContext(game).find((p) => p.id === 'mia').memories.length, 0);
  game = intervene(game, 'lin');
  assert.equal(demoIntentions(game).find((p) => p.id === 'lin').place, 'florist');
  const intentions = demoIntentions(game).map((p) => ({
    ...p,
    talkTo: p.id === 'zhou' ? 'mia' : null,
  }));
  const [plan] = planTurn(game, intentions);
  assert.equal(plan.evidence, true);
  assert.match(plan.text, /栗子/);
  assert.ok(!plan.text.includes('学校'));
  const conversations = toModelConversations(game, intentions);
  assert.ok(validConversations(conversations));
  assert.deepEqual(conversations[0].claimMeanings, [{ id: 0, text: getScenario(game).claims[0] }]);
});

test('unknown scenarios and corrupted arrival logs cannot be restored', () => {
  const game = createExploreGame(42, 'spring-party');
  game.scenarioId = 'unknown';
  assert.equal(validateGame(game), false);
  game.scenarioId = 'spring-party';
  game.storyProgress.arrivals = [{ id: 'lin', round: 1 }];
  assert.equal(validateGame(game), false);
});
