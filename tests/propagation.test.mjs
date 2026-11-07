import test from 'node:test';
import assert from 'node:assert/strict';
import { createExploreGame } from '../src/game/session.js';
import { advanceTurn, intervene, planTurn, validateGame } from '../src/simulation/engine.js';
import { demoIntentions } from '../src/simulation/life.js';
import {
  cascadeLayout,
  eventChain,
  propagationCsv,
  propagationSnapshot,
} from '../src/simulation/propagation.js';

function intent(game, sender, receiver) {
  return demoIntentions(game).map((p) => ({ ...p, talkTo: p.id === sender ? receiver : null }));
}

test('historical replay reconstructs exposure and beliefs from events, not the current state', () => {
  const start = createExploreGame();
  start.observer = true;
  const intents = intent(start, 'lin', 'mei'),
    plan = planTurn(start, intents)[0];
  let game = advanceTurn(
    start,
    [{ id: plan.id, claim: 3, text: '听说出了事故，要停课一周。' }],
    intents,
  );
  assert.equal(propagationSnapshot(game, 0).beliefs.mei.claim, null);
  let view = propagationSnapshot(game, 1);
  const rumor = view.events.at(-1);
  assert.equal(rumor.rootId, 'm0');
  assert.equal(rumor.depth, 1);
  assert.equal(rumor.categoryChanged, true);
  assert.equal(rumor.type, 'mutation');
  assert.equal(rumor.before.claim, null);
  assert.equal(rumor.after.claim, 3);
  game = advanceTurn(game, [], intent(game, 'qiao', 'mei'));
  view = propagationSnapshot(game);
  const correction = view.events.at(-1);
  assert.equal(correction.type, 'correction');
  assert.equal(correction.before.claim, 3);
  assert.equal(correction.after.claim, 0);
  assert.equal(correction.rootId, 'm1');
  assert.equal(view.metrics.corrected, 1);
  assert.equal(propagationSnapshot(game, 1).beliefs.mei.claim, 3);
  assert.deepEqual(view.beliefs.mei, {
    claim: 0,
    verified: true,
    messageId: game.residents.mei.messageId,
  });
});

test('a received rumor cannot erase an evidence-backed belief, and remains visible as an event', () => {
  const start = createExploreGame();
  start.observer = true;
  const game = advanceTurn(start, [], intent(start, 'lin', 'qiao')),
    view = propagationSnapshot(game),
    event = view.events.at(-1);
  assert.equal(event.blockedByEvidence, true);
  assert.equal(event.changed, false);
  assert.equal(event.after.verified, true);
  assert.equal(event.after.messageId, 'm1');
  assert.equal(view.metrics.reliable, 1);
  assert.equal(view.metrics.retellings, 1);
});

test('external interventions start independent roots; cascade edges use exact parent IDs', () => {
  let game = createExploreGame();
  game.observer = true;
  game = intervene(game, 'mei');
  const external = game.messages.at(-1).id;
  game = advanceTurn(game, [], intent(game, 'mei', 'zhou'));
  const view = propagationSnapshot(game),
    layout = cascadeLayout(view, external);
  assert.equal(view.roots.length, 3);
  assert.deepEqual(
    layout.nodes.map((n) => n.message.id),
    [external, game.messages.at(-1).id],
  );
  assert.deepEqual(layout.edges, [{ from: external, to: game.messages.at(-1).id }]);
  assert.deepEqual(
    eventChain(view, game.messages.at(-1).id).map((e) => e.message.id),
    layout.nodes.map((n) => n.message.id),
  );
  assert.equal(layout.nodes[0].type, 'intervention');
  assert.ok(layout.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
});

test('empty free-day cascades and ordinary chat cannot masquerade as scenario diffusion', () => {
  let game = createExploreGame(42, 'free-day');
  game.observer = true;
  game = advanceTurn(game, [], demoIntentions(game));
  assert.ok(game.encounters.length);
  const view = propagationSnapshot(game);
  assert.equal(view.events.length, 0);
  assert.equal(view.metrics.reached, 0);
  assert.equal(view.metrics.unaware, 25);
  assert.deepEqual(cascadeLayout(view).edges, []);
  assert.deepEqual(eventChain(view, 'unknown'), []);
});

test('all final beliefs agree with the simulator after multiple records and same-segment interventions', () => {
  let game = createExploreGame();
  game.observer = true;
  for (let round = 0; round < 12; round++) {
    if (round === 3) game = intervene(game, 'ada');
    game = advanceTurn(game);
  }
  const view = propagationSnapshot(game);
  for (const [id, state] of Object.entries(game.residents))
    assert.deepEqual(view.beliefs[id], {
      claim: state.claim,
      verified: state.verified,
      messageId: state.messageId,
    });
  const csv = propagationCsv(game);
  assert.equal(csv.split('\n').length, game.messages.length + 1);
  assert.ok(csv.includes('parent_id'));
  assert.ok(csv.includes('blocked_by_evidence'));
});

test('physical meeting coordinates are optional, recorded from snapshots and validated in saves', () => {
  const game = createExploreGame();
  game.observer = true;
  const intentions = intent(game, 'lin', 'mei');
  const positions = { actors: { lin: { x: 200, y: 300 }, mei: { x: 216, y: 300 } } };
  const next = advanceTurn(game, [], intentions, positions);
  assert.deepEqual(next.messages.at(-1).pixelMeeting, {
    sender: positions.actors.lin,
    receiver: positions.actors.mei,
  });
  assert.equal(validateGame(next), true);
  positions.actors.lin.x = 900;
  assert.equal(next.messages.at(-1).pixelMeeting.sender.x, 200);
  next.messages.at(-1).pixelMeeting.sender.x = NaN;
  assert.equal(validateGame(next), false);
  assert.equal(advanceTurn(game, [], intentions).messages.at(-1).pixelMeeting, undefined);
});

test('CSV escapes quoted text and neutralizes spreadsheet formula prefixes without changing the stored record', () => {
  const game = createExploreGame();
  game.messages[0].text = '=HYPERLINK("https://example.invalid", "test")';
  const csv = propagationCsv(game);
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid'));
  assert.ok(game.messages[0].text.startsWith('='));
});
