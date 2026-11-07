import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createExploreGame } from '../src/game/session.js';
import { planTurn, toModelConversations, validateGame } from '../src/simulation/engine.js';
import { lifeContext, demoIntentions, validIntentions } from '../src/simulation/life.js';
import { seedMinds, updateMinds, validMinds } from '../src/simulation/memory.js';
import { perceiveTown, visibleFrom } from '../src/simulation/perception.js';
import {
  COGNITION_VERSION,
  applyDayPlans,
  validScheduleChange,
} from '../src/simulation/day-plan.js';
import {
  advanceCognitiveTurn,
  demoDialogues,
  demoDayChanges,
  cognitiveDemoIntentions,
  resolveCognitiveEvidence,
} from '../src/simulation/cognition.js';
import { generatePrivateObservation } from '../server/cognition.mjs';
import { createApiHandler } from '../server/app.mjs';
import { BUILDINGS } from '../src/game/map.js';

function town(scenario = 'school-closure') {
  const game = createExploreGame(42, scenario);
  game.observer = true;
  game.cognitionVersion = COGNITION_VERSION;
  game.minds = seedMinds(game);
  game.intentions = demoIntentions(game).map((p) => ({
    ...p,
    talkTo: p.id === 'lin' ? 'qiao' : null,
  }));
  return game;
}
const config = { enabled: true, apiKey: 'test-secret', model: 'test', maxCalls: 12 };
async function withServer(handler, run) {
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
function answer(resident, conversation) {
  const index = conversation.turn;
  const source = index === 2 ? conversation.transcript[1] : resident.sources[0];
  const share = index !== 3;
  return {
    text:
      index === 0
        ? '听说明天可能停课。'
        : index === 3
          ? '好，那我们各自安排接下来的事。'
          : '我收到可靠公告，明天正常上课，只有操场暂停使用。',
    textEn:
      index === 0
        ? 'I heard school might close tomorrow.'
        : index === 3
          ? 'All right. Let us plan our next activities.'
          : 'The notice says school is open; only the playground is closed.',
    claim: share ? source.claim : null,
    sourceId: share ? source.id : null,
    intention: { ...resident.intention, talkTo: null },
    ...(index === 2
      ? {
          scheduleChange: {
            time: '09:20',
            place: 'school',
            kind: 'social',
            duration: 30,
            reason: '收到乔安的公告后，去学校了解安排。',
            reasonEn: 'Visit school after receiving Qiao’s notice.',
            evidenceIds: [conversation.transcript[1].id],
          },
        }
      : {}),
  };
}

test('local perception sees nearby residents but cannot see through buildings or learn private thoughts', () => {
  const game = town();
  const snapshot = {
    actors: {
      lin: { x: 38.5 * 16, y: 17.5 * 16 },
      mei: { x: 39.5 * 16, y: 17.5 * 16 },
      qiao: { x: 60.5 * 16, y: 7.5 * 16 },
    },
  };
  const observed = perceiveTown(game, snapshot, 'lin');
  assert.ok(observed.some((o) => o.subjectId === 'mei'));
  assert.ok(!observed.some((o) => o.subjectId === 'qiao'));
  assert.equal(visibleFrom({ x: 54.5 * 16, y: 3.5 * 16 }, { x: 54.5 * 16, y: 5.5 * 16 }), false);
  assert.equal(JSON.stringify(observed).includes('正常上课'), false);
  const next = advanceCognitiveTurn(game, demoDialogues(game), snapshot);
  next.minds = updateMinds(game, next, snapshot);
  assert.ok(next.minds.lin.memories.some((m) => m.subjectId === 'mei'));
  assert.ok(!next.minds.lin.memories.some((m) => m.subjectId === 'qiao'));
  assert.ok(validMinds(next.minds, next));
});

test('four independent HTTP prompts exchange only delivered speech and preserve causal source chains', async () => {
  const game = town();
  const people = lifeContext(game).map((person) => ({
    ...person,
    memories: [...person.memories, `PRIVATE_ONLY_${person.id}`],
  }));
  const requests = [];
  await withServer(
    async (request, response) => {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const body = JSON.parse(raw),
        payload = JSON.parse(body.messages[1].content);
      requests.push(payload);
      const data = answer(payload.resident, payload.conversation);
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
    },
    async (baseUrl) => {
      let attempts = 0,
        active = 0;
      const output = await generatePrivateObservation(
        { ...config, baseUrl },
        toModelConversations(game, game.intentions),
        people,
        'zh',
        {
          reserve: () => {
            attempts++;
            active++;
            return () => active--;
          },
        },
      );
      assert.equal(attempts, 4);
      assert.equal(active, 0);
      assert.deepEqual(
        requests.map((p) => p.resident.id),
        ['lin', 'qiao', 'lin', 'qiao'],
      );
      for (const [index, payload] of requests.entries()) {
        const serialized = JSON.stringify(payload);
        assert.equal(payload.conversation.transcript.length, index);
        for (const person of people)
          assert.equal(
            serialized.includes(`PRIVATE_ONLY_${person.id}`),
            person.id === payload.resident.id,
          );
      }
      assert.ok(!JSON.stringify(requests[0]).includes('正常上课'));
      assert.ok(requests[2].conversation.transcript.some((turn) => turn.text.includes('正常上课')));
      const next = advanceCognitiveTurn(game, output.sessions);
      next.minds = updateMinds(game, next);
      const correction = next.messages.find((m) => m.sender === 'qiao' && m.round === 1);
      const retelling = next.messages.find((m) => m.sender === 'lin' && m.dialogue?.turn === 2);
      assert.equal(retelling.parentId, correction.id);
      assert.equal(next.residents.lin.verified, true);
      assert.equal([...next.messages, ...next.encounters].filter((m) => m.dialogue).length, 4);
      const changes = output.scheduleChanges.map((change) => ({
        ...change,
        mode: 'ai',
        evidenceIds: resolveCognitiveEvidence(next, change.id, change.evidenceIds),
      }));
      applyDayPlans(next, changes);
      assert.ok(next.minds.lin.schedule.some((slot) => slot.place === 'school' && slot.replanned));
      assert.ok(validGameAndMinds(next));
      const corrupted = structuredClone(next);
      corrupted.messages.at(-1).parentId = 'm0';
      assert.equal(validateGame(corrupted), false);
    },
  );
});

function validGameAndMinds(game) {
  return validateGame(game) && validMinds(game.minds, game);
}

test('schedule revisions require personal evidence and arrival requires a real position', () => {
  const before = town(),
    next = advanceCognitiveTurn(before, demoDialogues(before));
  next.minds = updateMinds(before, next);
  const changes = demoDayChanges(before, next);
  applyDayPlans(next, changes);
  const person = changes[0].id,
    slot = next.minds[person].schedule.find((s) => s.replanned);
  assert.equal(slot.status, 'planned');
  const lastPlan = cognitiveDemoIntentions({ ...next, round: 2 }).find((p) => p.id === person);
  assert.equal(lastPlan.place, slot.place);
  const illegal = { ...changes[0], evidenceIds: ['someone-elses-secret'] };
  const previous = JSON.stringify(next.minds[person].planChanges);
  applyDayPlans(next, [illegal]);
  assert.equal(JSON.stringify(next.minds[person].planChanges), previous);
  assert.equal(validScheduleChange({ ...changes[0], time: '22:99' }, 0), false);
  const arrived = structuredClone(next);
  arrived.round = 2;
  const building = BUILDINGS.find((place) => place.id === slot.place);
  applyDayPlans(arrived, [], {
    actors: { [person]: { x: (building.home[0] + 0.5) * 16, y: (building.home[1] + 0.5) * 16 } },
  });
  assert.equal(arrived.minds[person].schedule.find((item) => item.replanned).status, 'completed');
  next.round = 2;
  applyDayPlans(next, [], { actors: { [person]: { x: 27 * 16, y: 26 * 16 } } });
  assert.equal(slot.status, 'planned', 'knowing a place does not count as visiting it');
  next.round = 10;
  applyDayPlans(next);
  assert.equal(slot.status, 'missed');
});

for (const scenario of ['school-closure', 'spring-party', 'lost-cat', 'free-day'])
  test(`72-segment ${scenario} private life preserves saves, memory bounds and source ancestry`, () => {
    let game = town(scenario);
    for (let round = 0; round < 72; round++) {
      game.intentions = cognitiveDemoIntentions(game);
      const next = advanceCognitiveTurn(game, demoDialogues(game));
      next.minds = updateMinds(game, next);
      applyDayPlans(next, demoDayChanges(game, next));
      next.intentions = cognitiveDemoIntentions(next);
      assert.ok(validIntentions(next.intentions));
      assert.ok(validGameAndMinds(next), `invalid save at ${round + 1}`);
      game = next;
    }
  });

test('actual per-utterance quotas reserve four calls before starting and reject replay', async () => {
  const game = town(),
    body = {
      gameId: 'private-town',
      round: 0,
      residents: lifeContext(game),
      conversations: toModelConversations(game, game.intentions),
    };
  let calls = 0;
  const observe = async (cfg, conversations, residents, language, { reserve }) => {
    for (let i = 0; i < 4; i++) {
      const release = reserve();
      calls++;
      release();
    }
    return { sessions: [], intentions: game.intentions };
  };
  const handler = createApiHandler({ config: { ...config, maxCalls: 4 }, observe });
  await withServer(handler, async (base) => {
    const post = (data) =>
      fetch(`${base}/api/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
    const response = await post(body),
      output = await response.json();
    assert.equal(response.status, 200);
    assert.equal(output.budget.used, 4);
    assert.equal(output.budget.remaining, 0);
    assert.equal((await post(body)).status, 429);
    assert.equal((await post({ ...body, round: 1 })).status, 429);
    assert.equal(calls, 4);
  });
  const insufficient = createApiHandler({ config: { ...config, maxCalls: 3 }, observe });
  await withServer(insufficient, async (base) => {
    const response = await fetch(`${base}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 429);
    assert.equal(calls, 4);
  });
});

test('an invented source rejects incomplete dialogue and charges only actual attempted calls', async () => {
  const game = town();
  const body = {
    gameId: 'invalid-source-run',
    round: 0,
    residents: lifeContext(game),
    conversations: toModelConversations(game, game.intentions),
  };
  let attempts = 0;
  await withServer(
    async (request, response) => {
      let raw = '';
      for await (const chunk of request) raw += chunk;
      const { resident, conversation } = JSON.parse(JSON.parse(raw).messages[1].content);
      attempts++;
      const data = answer(resident, conversation);
      if (attempts === 2) {
        data.sourceId = 'unseen-private-notice';
        data.claim = 0;
      }
      response
        .writeHead(200, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(data) } }] }));
    },
    async (baseUrl) => {
      const handler = createApiHandler({ config: { ...config, baseUrl } });
      await withServer(handler, async (base) => {
        const post = (data) =>
          fetch(`${base}/api/turn`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          });
        const foreign = structuredClone(body);
        foreign.conversations[0].sourceId = 'unseen';
        assert.equal((await post(foreign)).status, 400);
        assert.equal(attempts, 0);
        const response = await post(body),
          data = await response.json();
        assert.equal(response.status, 502);
        assert.equal(data.budget.used, 2);
        assert.equal(data.sessions, undefined);
        assert.equal(attempts, 2);
        assert.ok(!JSON.stringify(data).includes(config.apiKey));
        assert.equal((await post(body)).status, 429);
      });
    },
  );
});

test('disconnecting a private conversation aborts the current provider request and prevents later turns', async () => {
  const game = town();
  let started;
  const pending = new Promise((resolve) => {
    started = resolve;
  });
  let calls = 0;
  await withServer(
    async (request) => {
      for await (const chunk of request) {
        /* consume request before cancellation */
      }
      calls++;
      started();
      // Keep the provider response pending until the client disconnects.
    },
    async (baseUrl) => {
      const handler = createApiHandler({ config: { ...config, baseUrl } });
      await withServer(handler, async (base) => {
        const abort = new AbortController();
        const operation = fetch(`${base}/api/turn`, {
          method: 'POST',
          signal: abort.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: 'cancelled-private-life',
            round: 0,
            residents: lifeContext(game),
            conversations: toModelConversations(game, game.intentions),
          }),
        });
        const rejected = assert.rejects(operation, { name: 'AbortError' });
        await pending;
        abort.abort();
        await rejected;
        await new Promise((resolve) => setTimeout(resolve, 80));
        assert.equal(calls, 1);
      });
    },
  );
});
