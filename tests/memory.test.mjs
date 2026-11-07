import { drawSprite } from '../src/game/paint.js';
import { validConversations, parseModelReply } from '../server/model.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createExploreGame } from '../src/game/session.js';
import {
  advanceTurn,
  intervene,
  planTurn,
  toModelConversations,
  validateGame,
} from '../src/simulation/engine.js';
import { RESIDENTS } from '../src/simulation/scenario.js';
import {
  seedMinds,
  updateMinds,
  retrieveMemories,
  validReflections,
  validMinds,
} from '../src/simulation/memory.js';
import { lifeContext, demoIntentions } from '../src/simulation/life.js';
import { createMap, NPC_HOMES, isWalkable } from '../src/game/map.js';
import { claimText, personText, messageText } from '../src/i18n.js';

test('25 residents have valid homes, bilingual identities and connected social links', () => {
  const map = createMap();
  assert.equal(RESIDENTS.length, 25);
  assert.equal(new Set(Object.values(NPC_HOMES).map((p) => p.join(','))).size, 25);
  for (const p of RESIDENTS) {
    assert.ok(isWalkable(map, ...NPC_HOMES[p.id]), p.id);
    for (const field of ['name', 'role', 'trait', 'goal']) assert.ok(personText(p.id, field, 'en'));
    assert.ok(p.links.every((id) => RESIDENTS.some((other) => other.id === id && id !== p.id)));
  }
  const reached = new Set(['lin']);
  for (let pass = 0; pass < RESIDENTS.length; pass++)
    for (const p of RESIDENTS) if (reached.has(p.id)) p.links.forEach((id) => reached.add(id));
  assert.equal(reached.size, 25);
});

test('retrieval balances relevance, recency and importance rather than only taking the latest messages', () => {
  const mind = {
    memories: [
      { id: 'old-notice', text: 'school official notice', round: 0, importance: 10 },
      { id: 'recent-coffee', text: 'a cup of coffee', round: 8, importance: 2 },
      { id: 'irrelevant', text: 'garden leaves', round: 0, importance: 2 },
    ],
  };
  const result = retrieveMemories(mind, 'school official notice', 8, 2);
  assert.deepEqual(
    result.map((m) => m.id),
    ['old-notice', 'recent-coffee'],
  );
  assert.equal(mind.memories.length, 3);
});

test('memory records stay personal and reflections must cite the resident’s own retrieved experiences', () => {
  const game = createExploreGame();
  game.minds = seedMinds(game);
  const context = lifeContext(game);
  assert.equal(context.find((p) => p.id === 'mei').memories.length, 0);
  const qiaoMemory = context.find((p) => p.id === 'qiao').memoryRecords[0].id;
  const reflection = {
    id: 'qiao',
    text: '家长可能需要看到原始公告。',
    textEn: 'Parents may need to see the original notice.',
    evidenceIds: [qiaoMemory],
  };
  assert.equal(validReflections([reflection], context), true);
  assert.equal(validReflections([{ ...reflection, id: 'mei' }], context), false);
  assert.equal(validReflections([{ ...reflection, evidenceIds: ['invented'] }], context), false);
  const next = advanceTurn(game);
  const minds = updateMinds(game, next, { actors: { qiao: { x: 968, y: 120 } } }, [reflection]);
  assert.equal(minds.qiao.reflections.length, 1);
  assert.equal(minds.mei.reflections.length, 0);
  assert.ok(minds.qiao.memories.some((m) => m.kind === 'observation'));
  assert.equal(validMinds(minds), true);
  const invalid = structuredClone(minds);
  invalid.qiao.reflections[0].evidenceIds = ['missing'];
  assert.equal(validMinds(invalid), false);
  assert.equal(game.minds.qiao.reflections.length, 0);
});

test('interventions create personal memories and both translations preserve the official fact', () => {
  const game = createExploreGame();
  game.minds = seedMinds(game);
  const next = intervene(game, 'mei');
  next.minds = updateMinds(game, next);
  assert.equal(next.minds.mei.memories.length, 1);
  assert.equal(next.minds.ada.memories.length, 0);
  assert.match(messageText(next.messages.at(-1), 'en'), /classes continue/);
  assert.match(claimText(3, 'en'), /week/);
  assert.equal(validMinds(next.minds), true);
});

test('bounded memory retention removes reflection citations that no longer exist', () => {
  let game = createExploreGame();
  game.minds = seedMinds(game);
  const cited = game.minds.qiao.memories[0].id;
  game.minds.qiao.reflections.push({
    text: 'A past thought.',
    textEn: 'A past thought.',
    evidenceIds: [cited],
  });
  for (let i = 0; i < 110; i++) {
    const next = { ...game, round: i + 1 };
    next.minds = updateMinds(game, next, { actors: { qiao: { x: 968, y: 120 } } });
    game = next;
  }
  assert.equal(game.minds.qiao.memories.length, 100);
  assert.equal(game.minds.qiao.reflections.length, 0);
});

test('uninformed residents can meet and remember casual conversations without acquiring a school belief', () => {
  const game = createExploreGame();
  game.observer = true;
  game.minds = seedMinds(game);
  const intentions = demoIntentions(game).map((p) => ({
    ...p,
    talkTo: p.id === 'ada' ? 'luna' : null,
  }));
  const [plan] = planTurn(game, intentions);
  assert.equal(plan.kind, 'chat');
  assert.equal(plan.claim, null);
  game.intentions = intentions;
  const conversations = toModelConversations(game, intentions);
  assert.equal(validConversations(conversations), true);
  assert.deepEqual(conversations[0].allowedClaims, [null]);
  assert.throws(() =>
    parseModelReply(
      JSON.stringify({ replies: [{ id: plan.id, claim: 0, text: 'invented notice' }] }),
      conversations,
    ),
  );
  const next = advanceTurn(
    game,
    [
      {
        id: plan.id,
        claim: null,
        text: '今天去图书馆一起工作吗？',
        textEn: 'Shall we work at the library today?',
      },
    ],
    intentions,
  );
  next.minds = updateMinds(game, next);
  assert.equal(next.messages.length, game.messages.length);
  assert.equal(next.encounters.length, 1);
  assert.equal(next.residents.ada.claim, null);
  assert.equal(next.residents.luna.claim, null);
  assert.equal(next.minds.ada.memories[0].kind, 'conversation');
  assert.equal(next.minds.luna.memories[0].textEn, 'Shall we work at the library today?');
  assert.equal(next.encounters[0].mode, 'ai');
  assert.ok(validateGame(next));
  assert.ok(validMinds(next.minds, next));
  const damaged = structuredClone(next);
  damaged.encounters[0].claim = 0;
  assert.equal(validateGame(damaged), false);
});

test('character rendering keeps the square frame proportion rather than squeezing the body', () => {
  const draws = [];
  const ctx = {
    fillRect() {},
    drawImage(...args) {
      draws.push(args);
    },
  };
  drawSprite(ctx, { width: 1086, height: 1448 }, 'lin', 100, 120, 0, false, 0);
  const args = draws[0];
  assert.equal(args[3] / args[4], args[7] / args[8]);
  assert.equal(args[7], 46);
});

test('an entire 72-segment observer day preserves valid bilingual minds, chats and source chains', () => {
  let game = createExploreGame();
  game.observer = true;
  game.minds = seedMinds(game);
  const actors = Object.fromEntries(
    Object.entries(NPC_HOMES).map(([id, [x, y]]) => [id, { x: (x + 0.5) * 16, y: (y + 0.5) * 16 }]),
  );
  for (let round = 0; round < 72; round++) {
    const intents = demoIntentions(game),
      plans = planTurn(game, intents);
    assert.equal(new Set(plans.flatMap((p) => [p.sender, p.receiver])).size, plans.length * 2);
    const next = advanceTurn(game, [], intents);
    next.minds = updateMinds(game, next, { actors });
    assert.ok(validateGame(next), `game at ${round + 1}`);
    assert.ok(validMinds(next.minds, next), `minds at ${round + 1}`);
    game = next;
  }
  assert.equal(game.round, 72);
  assert.ok(game.encounters.length > 0);
  assert.ok(Object.values(game.minds).every((m) => m.memories.length <= 100));
  assert.ok(game.messages.every((m) => typeof m.textEn === 'string' && m.textEn.length > 0));
});
