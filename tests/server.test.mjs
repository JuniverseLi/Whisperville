import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSettingsStore, testModelConnection } from '../server/settings.mjs';
import { seedMinds } from '../src/simulation/memory.js';
import { RESIDENTS } from '../src/simulation/scenario.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApiHandler } from '../server/app.mjs';
import {
  generateDialogue,
  generateObservation,
  parseModelReply,
  readModelConfig,
} from '../server/model.mjs';
import { demoIntentions, lifeContext } from '../src/simulation/life.js';
import { createExploreGame } from '../src/game/session.js';
import { createGame, toModelConversations } from '../src/simulation/engine.js';

async function withApi(options, run) {
  const handler = createApiHandler(options);
  const server = createServer(async (request, response) => {
    if (!(await handler(request, response))) response.writeHead(404).end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await run(base);
  } finally {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections();
    });
  }
}

const payload = () => ({
  gameId: 'test-game',
  round: 0,
  conversations: toModelConversations(createGame()),
});
const post = (base, body, headers = {}) =>
  fetch(`${base}/api/turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
const aiConfig = {
  enabled: true,
  model: 'test-model',
  apiKey: 'secret-do-not-expose',
  baseUrl: 'https://private.invalid/v1',
  maxCalls: 2,
};
const generate = async (config, conversations) =>
  conversations.map((item) => ({
    id: item.id,
    claim: item.allowedClaims[0],
    text: '听说明天可能停课。',
  }));

test('model configuration requires all credentials and bounds the call budget', () => {
  assert.equal(readModelConfig({}).enabled, false);
  assert.equal(readModelConfig({ LLM_API_KEY: 'key' }).enabled, false);
  assert.equal(readModelConfig({ LLM_MAX_CALLS_PER_GAME: '-1' }).maxCalls, 12);
  assert.equal(readModelConfig({ LLM_MAX_CALLS_PER_GAME: '1000' }).maxCalls, 50);
});

test('observation planning supports quiet periods, bounds requests and shares model quotas', async () => {
  const game = createExploreGame(),
    residents = lifeContext(game);
  let calls = 0;
  await withApi(
    {
      config: aiConfig,
      observe: async (config, conversations, people, language, { reserve }) => {
        const release = reserve();
        release();
        calls++;
        assert.equal(people.length, RESIDENTS.length);
        return { replies: [], intentions: demoIntentions(game) };
      },
    },
    async (base) => {
      const body = { gameId: 'observer-run', round: 0, conversations: [], residents };
      assert.equal((await post(base, { ...body, residents: residents.slice(1) })).status, 400);
      const response = await post(base, body);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).intentions.length, RESIDENTS.length);
      assert.equal((await post(base, body)).status, 429);
      assert.equal((await post(base, { ...body, round: 1 })).status, 200);
      assert.equal((await post(base, { ...body, round: 2 })).status, 429);
      assert.equal(calls, 2);
    },
  );
});

test('private observation adapter parses bilingual personal actions and rejects invented places or citations', async () => {
  const game = createExploreGame();
  game.minds = seedMinds(game);
  let invalid = false,
    received;
  const provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = JSON.parse(body);
    const { resident } = JSON.parse(received.messages[1].content);
    const intention = { ...resident.intention };
    if (invalid === 'place') intention.place = 'outside-world';
    const reflection = {
      text: '家长需要公告依据。',
      textEn: 'Parents need the notice.',
      evidenceIds: [invalid === 'citation' ? 'invented' : resident.memoryRecords[0].id],
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                text: '先忙自己的事。',
                textEn: 'I will finish my tasks.',
                claim: null,
                sourceId: null,
                intention,
                reflection,
              }),
            },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  try {
    const config = { ...aiConfig, baseUrl: `http://127.0.0.1:${provider.address().port}` };
    const output = await generateObservation(config, [], lifeContext(game));
    assert.equal(output.intentions.length, RESIDENTS.length);
    assert.equal(received.max_tokens, 2048);
    assert.equal(JSON.parse(received.messages[1].content).residents, undefined);
    assert.equal(output.intentions[0].activityEn, demoIntentions(game)[0].activityEn);
    assert.equal(output.reflections[0].textEn, 'Parents need the notice.');
    invalid = 'place';
    await assert.rejects(() => generateObservation(config, [], lifeContext(game)));
    invalid = 'citation';
    await assert.rejects(() => generateObservation(config, [], lifeContext(game)));
  } finally {
    await new Promise((resolve) => {
      provider.close(resolve);
      provider.closeAllConnections();
    });
  }
});

test('the provider adapter sends a bounded batch and parses a real HTTP response', async () => {
  const conversations = payload().conversations;
  let received;
  const provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    received = {
      path: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(body),
    };
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [
          {
            message: { content: JSON.stringify({ replies: await generate(null, conversations) }) },
          },
        ],
      }),
    );
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  try {
    const replies = await generateDialogue(
      { ...aiConfig, baseUrl: `http://127.0.0.1:${provider.address().port}/v1` },
      conversations,
    );
    assert.equal(received.path, '/v1/chat/completions');
    assert.equal(received.authorization, `Bearer ${aiConfig.apiKey}`);
    assert.equal(received.body.max_tokens, 900);
    assert.equal(received.body.model, 'test-model');
    assert.equal(received.body.messages.length, 2);
    assert.deepEqual(JSON.parse(received.body.messages[1].content), conversations);
    assert.equal(replies.length, conversations.length);
  } finally {
    await new Promise((resolve) => {
      provider.close(resolve);
      provider.closeAllConnections();
    });
  }
});

test('offline API makes no provider calls and exposes no secret', async () => {
  await withApi(
    {
      config: readModelConfig({}),
      generate: () => {
        throw new Error('must not call');
      },
    },
    async (base) => {
      const status = await (await fetch(`${base}/api/status`)).json();
      assert.equal(status.mode, 'demo');
      const response = await post(base, payload());
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { mode: 'demo', replies: [] });
    },
  );
});

test('invalid, oversized, cross-origin and wrong-content-type requests are rejected', async () => {
  await withApi({ config: aiConfig, generate }, async (base) => {
    assert.equal((await post(base, null)).status, 400);
    assert.equal((await post(base, { ...payload(), round: 13 })).status, 400);
    assert.equal((await post(base, { ...payload(), conversations: [] })).status, 400);
    assert.equal((await post(base, { ...payload(), padding: 'x'.repeat(20_000) })).status, 413);
    assert.equal(
      (await post(base, payload(), { Origin: 'https://untrusted.invalid' })).status,
      403,
    );
    assert.equal((await post(base, payload(), { 'Content-Type': 'text/plain' })).status, 415);
    assert.equal((await fetch(`${base}/api/no-such-route`)).status, 404);
  });
});

test('AI requests are bounded per game and cannot replay a paid round', async () => {
  await withApi({ config: aiConfig, generate }, async (base) => {
    const response = await post(base, payload());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).mode, 'ai');
    assert.equal((await post(base, payload())).status, 429);
    assert.equal((await post(base, { ...payload(), round: 1 })).status, 200);
    assert.equal((await post(base, { ...payload(), round: 2 })).status, 429);
    const status = JSON.stringify(await (await fetch(`${base}/api/status`)).json());
    assert.equal(status.includes(aiConfig.apiKey), false);
    assert.equal(status.includes(aiConfig.baseUrl), false);
  });
});

test('provider errors are sanitized and still consume the reserved budget', async () => {
  await withApi(
    {
      config: { ...aiConfig, maxCalls: 1 },
      generate: async () => {
        throw new Error('secret-do-not-expose');
      },
    },
    async (base) => {
      const response = await post(base, payload());
      assert.equal(response.status, 502);
      assert.equal((await response.text()).includes('secret-do-not-expose'), false);
      assert.equal((await post(base, { ...payload(), round: 1 })).status, 429);
    },
  );
});

test('simultaneous clicks cannot create duplicate provider calls', async () => {
  let calls = 0;
  let release;
  const wait = new Promise((resolve) => {
    release = resolve;
  });
  await withApi(
    {
      config: aiConfig,
      generate: async (...args) => {
        calls += 1;
        await wait;
        return generate(...args);
      },
    },
    async (base) => {
      const first = post(base, payload());
      while (calls === 0) await new Promise((resolve) => setTimeout(resolve, 5));
      assert.equal((await post(base, payload())).status, 429);
      release();
      assert.equal((await first).status, 200);
      assert.equal(calls, 1);
    },
  );
});

test('model replies require an exact set of IDs and evidence-compatible claims', () => {
  const conversations = payload().conversations;
  const replies = [{ id: conversations[0].id, claim: 1, text: '听说明天学校可能停课。' }];
  assert.deepEqual(parseModelReply(JSON.stringify({ replies }), conversations), replies);
  assert.deepEqual(
    parseModelReply(`\`\`\`json\n${JSON.stringify({ replies })}\n\`\`\``, conversations),
    replies,
  );
  for (const invalid of [
    [],
    [{ ...replies[0], id: 'unknown' }],
    [{ ...replies[0], claim: 0 }],
    [{ ...replies[0], text: '' }],
    [replies[0], replies[0]],
  ]) {
    assert.throws(() => parseModelReply(JSON.stringify({ replies: invalid }), conversations));
  }
});

test('API configuration is masked, persisted and immediately used by connection tests and turns', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'whisperville-settings-'));
  const store = createSettingsStore(join(directory, 'api.json'));
  let tested = 0,
    generated = 0;
  const disabled = readModelConfig({});
  const body = {
    baseUrl: 'http://127.0.0.1:9999/v1/chat/completions',
    model: 'local-model',
    apiKey: 'test-private-key',
    maxCalls: 3,
  };
  const configPost = (base, path, value, headers = {}) =>
    fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(value),
    });
  try {
    await withApi(
      {
        config: disabled,
        settingsStore: store,
        testConnection: async (config) => {
          tested++;
          assert.equal(config.apiKey, body.apiKey);
          assert.equal(config.baseUrl, 'http://127.0.0.1:9999/v1');
        },
        generate: async (config, conversations) => {
          generated++;
          assert.equal(config.model, 'local-model');
          return generate(config, conversations);
        },
      },
      async (base) => {
        assert.equal((await (await fetch(`${base}/api/config`)).json()).hasApiKey, false);
        const saved = await configPost(base, '/api/config', body);
        assert.equal(saved.status, 200);
        const masked = await saved.text();
        assert.ok(!masked.includes('test-private-key'));
        assert.ok(!masked.includes('apiKey"'));
        assert.equal((await (await fetch(`${base}/api/status`)).json()).mode, 'ai');
        const sameEndpoint = { ...body, baseUrl: 'http://127.0.0.1:9999/v1', apiKey: '' };
        assert.equal((await configPost(base, '/api/config/test', sameEndpoint)).status, 200);
        assert.equal(tested, 1);
        assert.equal((await post(base, payload())).status, 200);
        assert.equal(generated, 1);
        assert.equal(
          (
            await configPost(base, '/api/config', {
              ...sameEndpoint,
              baseUrl: 'https://different.invalid/v1',
            })
          ).status,
          400,
        );
        assert.equal(
          (await configPost(base, '/api/config', body, { Origin: 'https://evil.invalid' })).status,
          403,
        );
        assert.equal(
          (await configPost(base, '/api/config', { ...body, model: '   ' })).status,
          400,
        );
        assert.equal(
          (await configPost(base, '/api/config', { ...body, baseUrl: 'file:///tmp/api' })).status,
          400,
        );
      },
    );
    assert.equal(store.read(disabled).apiKey, body.apiKey);
    await withApi(
      {
        config: disabled,
        settingsStore: store,
        testConnection: async () => {
          throw new Error('test-private-key');
        },
      },
      async (base) => {
        assert.equal((await (await fetch(`${base}/api/status`)).json()).model, body.model);
        const response = await configPost(base, '/api/config/test', { ...body, apiKey: '' });
        assert.equal(response.status, 502);
        assert.ok(!(await response.text()).includes('test-private-key'));
      },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('25-person memory contexts fit the bounded observation API and invalid languages are rejected', async () => {
  const game = createExploreGame();
  game.minds = seedMinds(game);
  for (const p of RESIDENTS)
    for (let i = 0; i < 6; i++)
      game.minds[p.id].memories.push({
        id: `observed-${i}`,
        kind: 'observation',
        round: 0,
        importance: 2,
        text: '春'.repeat(160),
        textEn: 'Spring.',
      });
  const residents = lifeContext(game);
  const body = { gameId: 'memory-context', round: 0, language: 'zh', conversations: [], residents };
  assert.ok(Buffer.byteLength(JSON.stringify(body)) > 16384);
  await withApi({ config: readModelConfig({}) }, async (base) => {
    assert.equal((await post(base, body)).status, 200);
    assert.equal((await post(base, { ...body, language: 'invalid' })).status, 400);
    assert.equal((await post(base, { ...body, padding: 'x'.repeat(262144) })).status, 413);
  });
});

test('connection testing uses a real bounded HTTP request without exposing provider errors', async () => {
  let received;
  const provider = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    received = {
      path: request.url,
      authorization: request.headers.authorization,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    };
    response
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  try {
    assert.equal(
      await testModelConnection({
        ...aiConfig,
        baseUrl: `http://127.0.0.1:${provider.address().port}/v1`,
      }),
      true,
    );
    assert.equal(received.path, '/v1/chat/completions');
    assert.equal(received.body.max_tokens, 16);
    assert.equal(received.authorization, `Bearer ${aiConfig.apiKey}`);
  } finally {
    await new Promise((resolve) => {
      provider.close(resolve);
      provider.closeAllConnections();
    });
  }
});
