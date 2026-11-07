import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApiHandler } from '../server/app.mjs';
import { replayModelStudy } from '../server/model-study.mjs';
import {
  createStudyTrial,
  studyRequest,
  parseStudyAction,
  finishStudyRound,
  scoreStudyTrial,
  validStudyOptions,
} from '../src/simulation/model-study.js';

const secret = 'private-study-test-key';
const config = {
  enabled: true,
  baseUrl: 'https://example.invalid/v1',
  apiKey: secret,
  model: 'test-model',
  maxCalls: 12,
};
const options = () => ({ seedStart: 1000, seeds: 1, language: 'en', clientId: randomUUID() });
const post = (base, path, body = {}) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
async function withApi(settings, run) {
  const api = createApiHandler(settings),
    server = createServer(async (req, res) => {
      if (!(await api(req, res))) res.writeHead(404).end();
    });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => {
      server.close(r);
      server.closeAllConnections();
    });
  }
}
async function waitResult(base, id) {
  for (let i = 0; i < 300; i++) {
    const report = await (await fetch(`${base}/api/model-studies/${id}`)).json();
    if (!['queued', 'running'].includes(report.status)) return report;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('Study stalled');
}
function mockReply(body) {
  const input = JSON.parse(body.messages[1].content),
    numbers = [input.ownNumber, ...input.inbox.map((m) => Number(m.text.match(/\d+/)[0]))];
  return {
    content: JSON.stringify({
      message: { to: input.peers, text: `My number is ${input.ownNumber}.` },
      answer: [...new Set(numbers)].sort((a, b) => a - b),
    }),
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };
}

test('private prompts expose only the recipient’s number until messages are delivered', () => {
  const trial = createStudyTrial(42, 'communication');
  const request = studyRequest(trial, 'lin', 0, 'model');
  const input = JSON.parse(request.messages[1].content);
  assert.equal(input.ownNumber, trial.privateNumbers.lin);
  assert.deepEqual(input.inbox, []);
  assert.equal(input.privateNumbers, undefined);
  const actions = ['lin', 'mei', 'zhou', 'qiao'].map((id) => ({
    id,
    action: parseStudyAction(mockReply(studyRequest(trial, id, 0, 'model')).content, id),
  }));
  assert.equal(trial.messages.length, 0);
  finishStudyRound(trial, 0, actions);
  const second = JSON.parse(studyRequest(trial, 'lin', 1, 'model').messages[1].content);
  assert.equal(second.inbox.length, 3);
  assert.equal(scoreStudyTrial(trial).solved, false);
  const blocked = createStudyTrial(42, 'no-communication');
  finishStudyRound(blocked, 0, actions);
  assert.equal(blocked.messages.length, 0);
  assert.deepEqual(trial.privateNumbers, blocked.privateNumbers);
});
test('action parsing rejects unknown recipients and malformed output without supplying an answer', () => {
  assert.deepEqual(parseStudyAction('{}', 'lin'), { message: null, answer: null });
  for (const raw of [
    'not json',
    '[]',
    '{"message":{"to":["unknown"],"text":"hi"}}',
    '{"answer":[1,2,3,4]}',
  ])
    assert.throws(() => parseStudyAction(raw, 'lin'));
  assert.equal(validStudyOptions({ seedStart: 1, seeds: 100, language: 'en' }), false);
});
test('real HTTP adapter runs 16 private-context calls, stores traces, and replays without further calls', async () => {
  let calls = 0;
  const provider = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(req.headers.authorization, `Bearer ${secret}`);
    assert.equal(body.max_tokens, 1024);
    assert.ok(!JSON.stringify(body).includes(secret));
    calls++;
    const data = mockReply(body);
    res
      .writeHead(200, { 'Content-Type': 'application/json' })
      .end(
        JSON.stringify({ choices: [{ message: { content: data.content } }], usage: data.usage }),
      );
  });
  await new Promise((r) => provider.listen(0, '127.0.0.1', r));
  const snapshots = [];
  try {
    await withApi(
      {
        config: { ...config, baseUrl: `http://127.0.0.1:${provider.address().port}` },
        studyStore: {
          write: async (r) => snapshots.push(structuredClone(r)),
          read: async () => null,
        },
      },
      async (base) => {
        const body = options();
        const response = await post(base, '/api/model-studies', body);
        assert.equal(response.status, 202);
        const { id } = await response.json();
        const report = await waitResult(base, id);
        assert.equal(report.status, 'completed');
        assert.equal(calls, 16);
        assert.equal(report.calls.length, 16);
        assert.ok(!JSON.stringify(report).includes(secret));
        assert.equal(report.trials[0].score.solved, true);
        assert.equal(report.trials[1].score.solved, false);
        assert.equal(report.trials[1].messages.length, 0);
        assert.equal(report.replayVerified, true);
        assert.ok(
          report.calls.every((c) => c.status === 'ok' && c.response.usage.total_tokens === 120),
        );
        assert.ok(snapshots.some((r) => r.calls.some((c) => c.status === 'pending')));
        assert.equal((await post(base, `/api/model-studies/${id}/replay`)).status, 200);
        assert.equal(calls, 16);
        assert.equal((await (await post(base, '/api/model-studies', body)).json()).id, id);
        assert.equal(calls, 16);
        const changed = structuredClone(report);
        changed.calls[0].request.messages[1].content = '{}';
        assert.throws(() => replayModelStudy(changed));
        const budget = await (await fetch(`${base}/api/model-studies/status`)).json();
        assert.equal(budget.remainingProcessCalls, 104);
        assert.equal(budget.latestStudyId, id);
      },
    );
  } finally {
    await new Promise((r) => {
      provider.close(r);
      provider.closeAllConnections();
    });
  }
});
test('unconfigured and invalid requests cannot trigger a provider call', async () => {
  let calls = 0;
  await withApi(
    {
      config: { ...config, enabled: false },
      studyProvider: async () => {
        calls++;
      },
    },
    async (base) => {
      assert.equal((await post(base, '/api/model-studies', options())).status, 503);
      assert.equal(
        (await post(base, '/api/model-studies', { ...options(), seeds: 5 })).status,
        400,
      );
      assert.equal(
        (
          await fetch(`${base}/api/model-studies`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: 'https://evil.invalid' },
            body: JSON.stringify(options()),
          })
        ).status,
        403,
      );
    },
  );
  assert.equal(calls, 0);
});
test('cancelling aborts a pending request, stops further calls and never produces rule results', async () => {
  let calls = 0;
  await withApi(
    {
      config,
      studyProvider: async (c, body, signal) => {
        calls++;
        return new Promise((resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
        );
      },
    },
    async (base) => {
      const { id } = await (await post(base, '/api/model-studies', options())).json();
      for (let i = 0; i < 100 && calls === 0; i++) await new Promise((r) => setTimeout(r, 5));
      assert.equal(calls, 1);
      assert.equal((await post(base, `/api/model-studies/${id}/cancel`)).status, 200);
      const report = await waitResult(base, id);
      assert.equal(report.status, 'cancelled');
      assert.equal(report.calls.length, 1);
      assert.ok(report.trials.every((t) => !t.score));
      assert.equal((await post(base, `/api/model-studies/${id}/replay`)).status, 400);
    },
  );
});
test('provider failures consume one attempt, sanitize errors and cannot silently fall back', async () => {
  let calls = 0;
  await withApi(
    {
      config,
      studyProvider: async () => {
        calls++;
        throw new Error(secret);
      },
    },
    async (base) => {
      const { id } = await (await post(base, '/api/model-studies', options())).json(),
        report = await waitResult(base, id);
      assert.equal(report.status, 'failed');
      assert.equal(calls, 1);
      assert.ok(!JSON.stringify(report).includes(secret));
      assert.equal(report.calls[0].status, 'failed');
      assert.ok(report.trials.every((t) => !t.score));
    },
  );
});

test('concurrent start requests cannot create two paid studies while the audit write is pending', async () => {
  let calls = 0;
  await withApi(
    {
      config,
      studyStore: {
        write: async () => new Promise((r) => setTimeout(r, 15)),
        read: async () => null,
      },
      studyProvider: async (c, b, signal) => {
        calls++;
        return new Promise((resolve, reject) => {
          if (signal.aborted) reject(new Error('cancelled'));
          else
            signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
        });
      },
    },
    async (base) => {
      const responses = await Promise.all([
        post(base, '/api/model-studies', options()),
        post(base, '/api/model-studies', options()),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [202, 409]);
      const { id } = await responses.find((r) => r.status === 202).json();
      await post(base, `/api/model-studies/${id}/cancel`);
      const report = await waitResult(base, id);
      assert.equal(report.status, 'cancelled');
      assert.ok(calls <= 1);
    },
  );
});
test('raw model echoes of a key are redacted and unreported usage remains unknown', async () => {
  await withApi(
    {
      config,
      studyProvider: async () => ({
        content: JSON.stringify({ message: { to: [], text: secret }, answer: null }),
      }),
    },
    async (base) => {
      const { id } = await (await post(base, '/api/model-studies', options())).json(),
        report = await waitResult(base, id);
      assert.equal(report.status, 'completed');
      assert.equal(report.replayVerified, true);
      assert.ok(!JSON.stringify(report).includes(secret));
      assert.ok(report.calls.every((c) => c.response.content.includes('[REDACTED]')));
      assert.ok(report.calls.every((c) => c.response.usage.total_tokens === null));
    },
  );
});
test('an initial audit storage failure blocks provider calls and releases the start lock', async () => {
  let calls = 0;
  await withApi(
    {
      config,
      studyStore: {
        write: async () => {
          throw new Error('disk');
        },
        read: async () => null,
      },
      studyProvider: async () => {
        calls++;
      },
    },
    async (base) => {
      assert.equal((await post(base, '/api/model-studies', options())).status, 500);
      const status = await (await fetch(`${base}/api/model-studies/status`)).json();
      assert.equal(status.activeStudyId, null);
      assert.equal(status.remainingProcessCalls, 120);
      assert.equal(calls, 0);
    },
  );
});
