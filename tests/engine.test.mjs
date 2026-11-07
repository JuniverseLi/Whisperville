import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceTurn,
  createGame,
  getStats,
  intervene,
  isFinished,
  planTurn,
  toModelConversations,
  traceMessage,
  validateGame,
} from '../src/simulation/engine.js';
import { RESIDENTS, SCENARIO } from '../src/simulation/scenario.js';

test('a new game separates the initial rumor from verified facts', () => {
  const game = createGame();
  assert.deepEqual(getStats(game), {
    corrected: 0,
    rumor: 1,
    unaware: RESIDENTS.length - 1,
    distorted: 0,
  });
  assert.equal(game.remaining, 3);
  assert.equal(validateGame(game), true);
});

test('offline runs with the same seed and actions reproduce the same events', () => {
  let first = createGame(41, 'test');
  let second = createGame(41, 'test');
  for (let i = 0; i < 12; i++) {
    first = advanceTurn(first);
    second = advanceTurn(second);
  }
  assert.deepEqual(first, second);
});

test('rounds are simultaneous and preserve message provenance', () => {
  const initial = createGame();
  const next = advanceTurn(initial);
  assert.equal(next.messages.length, 2);
  assert.equal(next.messages[1].sender, 'lin');
  assert.equal(next.messages[1].parentId, 'm0');
  assert.equal(getStats(initial).unaware, RESIDENTS.length - 1);
  assert.equal(getStats(next).unaware, RESIDENTS.length - 2);
  assert.equal(next.history.length, 2);
});

test('evidence costs one intervention and cannot be spent twice on a verified resident', () => {
  const initial = createGame();
  const next = intervene(initial, 'lin');
  assert.equal(next.remaining, 2);
  assert.equal(next.residents.lin.verified, true);
  assert.equal(next.residents.lin.claim, 0);
  assert.equal(intervene(next, 'lin'), next);
  assert.equal(initial.residents.lin.verified, false);
});

test('a notice reaches up to three unverified residents and costs two', () => {
  const next = intervene(createGame(), 'lin', 'broadcast');
  assert.equal(next.remaining, 1);
  assert.equal(getStats(next).corrected, 3);
  assert.equal(next.messages.filter((message) => message.kind === 'broadcast').length, 3);
  assert.equal(validateGame(next), true);
  assert.equal(intervene(next, 'lin', 'broadcast'), next);
});

test('interventions reject invalid residents, actions and exhausted budgets', () => {
  const initial = createGame();
  assert.equal(intervene(initial, 'nobody'), initial);
  assert.equal(intervene(initial, 'lin', 'made-up'), initial);
  const exhausted = intervene(intervene(intervene(initial, 'lin'), 'mei'), 'zhou');
  assert.equal(exhausted.remaining, 0);
  assert.equal(intervene(exhausted, 'qiao'), exhausted);
});

test('official evidence propagates and later rumors cannot erase it', () => {
  let game = intervene(createGame(), 'lin');
  game.playMode = 'explore';
  for (let i = 0; i < 72 && !isFinished(game); i++) game = advanceTurn(game);
  assert.equal(getStats(game).corrected, RESIDENTS.length);
  assert.equal(isFinished(game), true);
  assert.equal(game.residents.lin.verified, true);
  for (const message of game.messages.filter((item) => item.parentId && item.evidence)) {
    assert.equal(game.messages.find((item) => item.id === message.parentId).evidence, true);
    assert.equal(message.claim, 0);
  }
});

test('model output cannot invent verified evidence or unknown claim categories', () => {
  const initial = createGame();
  const [plan] = planTurn(initial);
  for (const claim of [0, -1, 4, '1']) {
    const next = advanceTurn(initial, [{ id: plan.id, claim, text: 'fabricated' }]);
    assert.equal(next.messages.at(-1).mode, 'demo');
    assert.equal(getStats(next).corrected, 0);
  }
  const valid = advanceTurn(initial, [{ id: plan.id, claim: 3, text: '听说要停课一周！' }]);
  assert.equal(valid.messages.at(-1).mode, 'ai');
  assert.equal(valid.messages.at(-1).claim, 3);
});

test('model replies cannot replace or weaken evidence during a correction', () => {
  const game = intervene(createGame(), 'lin');
  const [plan] = planTurn(game);
  assert.equal(plan.evidence, true);
  const next = advanceTurn(game, [{ id: plan.id, claim: 3, text: '停课一周' }]);
  assert.equal(next.messages.at(-1).claim, 0);
  assert.equal(next.messages.at(-1).evidence, true);
});

test('trace follows a real source chain and terminates on unknown IDs', () => {
  let game = createGame();
  for (let i = 0; i < 5; i++) game = advanceTurn(game);
  const chain = traceMessage(game, game.messages.at(-1).id);
  assert.ok(chain.length > 1);
  assert.equal(chain[0].id, 'm0');
  for (let i = 1; i < chain.length; i++) assert.equal(chain[i].parentId, chain[i - 1].id);
  assert.deepEqual(traceMessage(game, 'unknown'), []);
});

test('a finished game cannot advance or spend interventions', () => {
  let game = createGame();
  for (let i = 0; i < SCENARIO.maxRounds; i++) game = advanceTurn(game);
  assert.equal(advanceTurn(game), game);
  assert.equal(intervene(game, 'lin'), game);
  assert.deepEqual(planTurn(game), []);
});

test('model context never reveals official facts to uninformed characters', () => {
  const [conversation] = toModelConversations(createGame());
  assert.equal(conversation.evidence, false);
  assert.deepEqual(conversation.allowedClaims, [1, 2, 3]);
  assert.equal(conversation.heard.includes(SCENARIO.fact), false);
});

test('saves reject broken references, unsupported versions and malformed history', () => {
  const game = advanceTurn(createGame());
  for (const mutate of [
    (value) => {
      value.version = 99;
    },
    (value) => {
      value.residents.lin.messageId = 'missing';
    },
    (value) => {
      value.history = [null, null];
    },
    (value) => {
      value.residents.extra = value.residents.lin;
    },
    (value) => {
      value.messages[1].parentId = value.messages[1].id;
    },
    (value) => {
      value.messages[0].evidence = true;
    },
  ]) {
    const broken = structuredClone(game);
    mutate(broken);
    assert.equal(validateGame(broken), false);
  }
  assert.equal(validateGame(null), false);
  assert.equal(validateGame(game), true);
});

test('many seeds preserve budgets, unique IDs, source chains, and population totals', () => {
  for (let seed = 0; seed < 100; seed++) {
    let game = createGame(seed);
    for (let turn = 0; turn < 12; turn++) {
      if (turn === 2) game = intervene(game, RESIDENTS[seed % RESIDENTS.length].id);
      if (turn === 5) game = intervene(game, 'lin', 'broadcast');
      game = advanceTurn(game);
      assert.equal(validateGame(game), true, `invalid save at seed ${seed}, turn ${turn}`);
      const stats = getStats(game);
      assert.equal(stats.corrected + stats.rumor + stats.unaware, RESIDENTS.length);
      assert.ok(game.remaining >= 0);
      assert.equal(new Set(game.messages.map((message) => message.id)).size, game.messages.length);
    }
  }
});
