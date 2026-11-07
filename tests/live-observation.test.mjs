import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveGame, commitLiveTurn } from '../src/simulation/live.js';
import { lifeContext } from '../src/simulation/life.js';
import { validateGame, toModelConversations } from '../src/simulation/engine.js';
import { generatePrivateObservation } from '../server/cognition.mjs';
import {
  createObservationAudit,
  createObservationStore,
  replayObservation,
  observationHash,
} from '../server/observation-audit.mjs';
import { NPC_HOMES } from '../src/game/map.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApiHandler } from '../server/app.mjs';

const config = { model: 'local-test-only', apiKey: 'private-credential' };
test('published real-town trace reproduces requests, usage and actual meetings without a provider', async () => {
  const report = JSON.parse(
    await readFile(new URL('../docs/results/live-town-run-v1.json', import.meta.url), 'utf8'),
  );
  const calls = report.observations.flatMap((observation) => observation.calls);
  assert.equal(calls.length, report.summary.calls);
  assert.equal(
    calls.reduce((sum, call) => sum + call.response.usage.total_tokens, 0),
    report.summary.usage.total_tokens,
  );
  assert.equal(report.summary.ruleFallbackCalls, 0);
  for (const observation of report.observations) {
    assert.equal((await replayObservation(observation)).modelCalls, 0);
    for (const call of observation.calls) {
      const payload = JSON.parse(call.request.messages[1].content);
      assert.equal(payload.resident.id, call.residentId);
      assert.deepEqual(Object.keys(payload), ['resident', 'conversation']);
      assert.equal(payload.conversation.transcript.length, call.turn ?? 0);
    }
  }
  assert.ok(report.summary.actualMeetings.every((meeting) => meeting.distancePixels < 31));
  assert.equal(report.game.residents.mia.verified, false);
  assert.equal(report.summary.metrics.at(-1).reached, 3);
});
async function withApi(options, run) {
  const handler = createApiHandler(options);
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}
const payloadFor = (game) => ({
  gameId: game.id,
  round: game.round,
  executionMode: 'live',
  attemptId: randomUUID(),
  ...inputFor(game),
});
const post = (base, body) =>
  fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
const snapshotFor = () => ({
  actors: Object.fromEntries(
    Object.entries(NPC_HOMES).map(([id, [x, y]]) => [id, { x: (x + 0.5) * 16, y: (y + 0.5) * 16 }]),
  ),
});
const inputFor = (game) => {
  const { minds, ...state } = game;
  const snapshot = snapshotFor();
  return {
    state,
    snapshot,
    residents: lifeContext(game, snapshot),
    conversations: toModelConversations(game, game.intentions),
    language: 'zh',
  };
};
async function setup(t) {
  const directory = await mkdtemp(join(tmpdir(), 'whisperville-live-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return createObservationStore(directory);
}
function decision(request) {
  const { resident, conversation } = JSON.parse(request.messages[1].content);
  const share = conversation.turn === 0 || conversation.turn === 2;
  const source = resident.sources[0];
  return {
    text: share ? source.text : '我会记下这次交流。',
    textEn: share ? source.textEn : 'I will remember this exchange.',
    claim: share ? source.claim : null,
    sourceId: share ? source.id : null,
    intention: {
      ...resident.intention,
      talkTo: null,
      activity: '整理自己的笔记',
      activityEn: 'Organize my own notes',
      reason: '根据自己的目标行动。',
      reasonEn: 'Act on my own goal.',
    },
  };
}

test('live towns start with scenario facts and pending intentions, with no scripted resident decisions', () => {
  const game = createLiveGame(42, 'school-closure');
  assert.ok(validateGame(game));
  assert.ok(game.messages.every((message) => message.mode === 'scenario'));
  assert.ok(
    game.intentions.every((intention) => intention.mode === 'pending' && intention.talkTo === null),
  );
  assert.throws(() => commitLiveTurn(game, null, snapshotFor()));
  assert.equal(game.round, 0);
});

test('live planning is audited before the provider call and replays without network access', async (t) => {
  const store = await setup(t),
    game = createLiveGame(42, 'school-closure'),
    input = inputFor(game);
  const audit = await createObservationAudit(store, config, input);
  let calls = 0;
  const result = await generatePrivateObservation(config, [], input.residents, 'zh', {
    audit: audit.hooks,
    provider: async (cfg, request) => {
      const persisted = await store.read(audit.report.id);
      assert.equal(persisted.calls[0].requestHash, observationHash(request));
      calls++;
      return {
        content: JSON.stringify(decision(request)),
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        servedModel: 'local-test-only',
        finishReason: 'stop',
      };
    },
  });
  await audit.finish(result);
  assert.equal(calls, 1);
  const report = await store.read(audit.report.id);
  assert.equal(report.status, 'completed');
  assert.equal(report.calls[0].response.usage.total_tokens, 150);
  assert.equal(report.replayVerified, true);
  assert.equal((await replayObservation(report)).modelCalls, 0);
  assert.ok(!JSON.stringify(report).includes(config.apiKey));
  const next = commitLiveTurn(
    game,
    { ...result, mode: 'ai', auditId: report.id, budget: { used: 1, limit: 12, remaining: 11 } },
    input.snapshot,
  );
  assert.equal(next.round, 1);
  assert.equal(next.intentions.filter((item) => item.mode === 'ai').length, 1);
  assert.equal(next.intentions.filter((item) => item.mode === 'pending').length, 24);
  assert.equal(next.messages.length, game.messages.length);
  assert.ok(validateGame(next));
  report.calls[0].response.content = '{}';
  await assert.rejects(() => replayObservation(report));
});

test('four audited utterances commit only model content and preserve inactive residents intentions', async (t) => {
  const store = await setup(t),
    game = createLiveGame(42, 'school-closure');
  game.intentions[0].talkTo = 'qiao';
  const input = inputFor(game),
    audit = await createObservationAudit(store, config, input);
  const result = await generatePrivateObservation(
    config,
    input.conversations,
    input.residents,
    'zh',
    {
      audit: audit.hooks,
      provider: async (cfg, request) => ({
        content: JSON.stringify(decision(request)),
        finishReason: 'stop',
        usage: null,
      }),
    },
  );
  await audit.finish(result);
  assert.equal(audit.report.calls.length, 4);
  const next = commitLiveTurn(
    game,
    {
      ...result,
      mode: 'ai',
      auditId: audit.report.id,
      budget: { used: 4, limit: 12, remaining: 8 },
    },
    input.snapshot,
  );
  const utterances = [...next.messages, ...next.encounters].filter((message) => message.dialogue);
  assert.equal(utterances.length, 4);
  assert.ok(utterances.every((message) => message.mode === 'ai'));
  assert.equal(next.intentions.find((item) => item.id === 'zhou').mode, 'pending');
  assert.equal((await replayObservation(audit.report)).ok, true);
});

test('failed output remains failed, preserves raw returned text, and never advances a live town', async (t) => {
  const store = await setup(t),
    game = createLiveGame(),
    input = inputFor(game),
    audit = await createObservationAudit(store, config, input);
  const error = await generatePrivateObservation(config, [], input.residents, 'zh', {
    audit: audit.hooks,
    provider: async () => ({
      content: '{"incomplete":',
      finishReason: 'length',
      usage: { total_tokens: 2048 },
    }),
  }).catch((error) => error);
  await audit.fail(error);
  assert.equal(audit.report.status, 'failed');
  assert.equal(audit.report.errorCode, 'output-truncated');
  assert.equal(audit.report.calls[0].response.content, '{"incomplete":');
  assert.equal(game.round, 0);
  await assert.rejects(() => replayObservation(audit.report));
});

test('an unavailable audit store blocks real calls and raw credential echoes are redacted', async (t) => {
  const game = createLiveGame(),
    input = inputFor(game);
  await assert.rejects(() =>
    createObservationAudit(
      {
        write: async () => {
          throw new Error('disk unavailable');
        },
      },
      config,
      input,
    ),
  );
  const store = await setup(t),
    audit = await createObservationAudit(store, config, input);
  const call = await audit.hooks.before({ prompt: 'private-credential' }, 'lin', null);
  await audit.hooks.received(call, { content: 'private-credential', usage: null });
  assert.ok(!JSON.stringify(await store.read(audit.report.id)).includes(config.apiKey));
});

test('strict HTTP observation refuses missing configuration or unwritable audits without invoking the model', async (t) => {
  const store = await setup(t),
    game = createLiveGame(),
    body = payloadFor(game);
  let calls = 0;
  const observe = async () => {
    calls++;
    throw new Error('Must not invoke');
  };
  await withApi(
    { config: { ...config, enabled: false, maxCalls: 12 }, observationStore: store, observe },
    async (base) => {
      const response = await post(base, body);
      assert.equal(response.status, 503);
      assert.equal((await response.json()).mode, undefined);
    },
  );
  await withApi(
    {
      config: { ...config, enabled: true, maxCalls: 12 },
      observationStore: {
        ...store,
        write: async () => {
          throw new Error('disk unavailable');
        },
      },
      observe,
    },
    async (base) => {
      const response = await post(base, body),
        data = await response.json();
      assert.equal(response.status, 502);
      assert.equal(data.budget.used, 0);
    },
  );
  assert.equal(calls, 0);
  assert.equal(game.round, 0);
});

test('persisted audit ledgers prevent completed-round replay and retain request usage across restarts', async (t) => {
  const store = await setup(t),
    game = createLiveGame(42, 'school-closure'),
    body = payloadFor(game);
  let calls = 0;
  const observe = (cfg, conversations, residents, language, hooks) =>
    generatePrivateObservation(cfg, conversations, residents, language, {
      ...hooks,
      provider: async (cfg, request) => {
        calls++;
        return { content: JSON.stringify(decision(request)), finishReason: 'stop' };
      },
    });
  const options = {
    config: { ...config, enabled: true, maxCalls: 2 },
    observationStore: store,
    observe,
  };
  let output;
  await withApi(options, async (base) => {
    const response = await post(base, body);
    assert.equal(response.status, 200);
    output = await response.json();
  });
  assert.equal(output.budget.used, 1);
  const next = commitLiveTurn(game, output, body.snapshot);
  await withApi(options, async (base) => {
    assert.equal((await post(base, payloadFor(game))).status, 429);
    const response = await post(base, payloadFor(next));
    assert.equal(response.status, 200);
    const second = await response.json();
    assert.equal(second.budget.used, 2);
    const last = commitLiveTurn(next, second, body.snapshot);
    assert.equal((await post(base, payloadFor(last))).status, 429);
    assert.equal(calls, 2);
  });
});
