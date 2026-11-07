import { createModelStudyApi } from './model-study.mjs';
import {
  generateDialogue,
  generateObservation,
  readModelConfig,
  validConversations,
} from './model.mjs';
import { validLifeContext } from '../src/simulation/life.js';
import { observationCallCount } from './cognition.mjs';
import { createObservationAudit, replayObservation } from './observation-audit.mjs';
import { validateGame } from '../src/simulation/engine.js';
import { publicSettings, validateSettings, testModelConnection } from './settings.mjs';

function send(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(JSON.stringify(data));
}

async function readBody(request, limit = 16_384) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error('body-too-large');
    chunks.push(chunk);
  }
  // Decode once: a Chinese UTF-8 character may span two network chunks.
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function createApiHandler({
  config = readModelConfig(),
  generate = generateDialogue,
  observe = generateObservation,
  now = Date.now,
  settingsStore = null,
  testConnection = testModelConnection,
  studyStore = null,
  studyProvider,
  observationStore = null,
} = {}) {
  if (settingsStore) config = settingsStore.read(config);
  const games = new Map();
  const activeAudits = new Set();
  const gameLoads = new Map();
  let activeCalls = 0;
  let totalCalls = 0;
  let reservedCalls = 0;
  const modelStudies = createModelStudyApi({
    getConfig: () => config,
    remaining: () => 120 - totalCalls - reservedCalls,
    store: studyStore,
    provider: studyProvider,
    send,
    readBody,
    reserve: () => {
      if (totalCalls + reservedCalls >= 120) throw new Error('process-budget');
      if (activeCalls >= 2) throw new Error('provider-busy');
      totalCalls++;
      activeCalls++;
      return () => {
        activeCalls--;
      };
    },
  });
  return async (request, response) => {
    const path = request.url?.split('?')[0];
    if (!path?.startsWith('/api/')) return false;
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          send(response, 403, { error: '仅接受同源请求。' });
          return true;
        }
      } catch {
        send(response, 403, { error: '请求来源无效。' });
        return true;
      }
    }
    if (await modelStudies(request, response, path)) return true;
    if (path.startsWith('/api/observations/')) {
      if (path === '/api/observations/latest' && request.method === 'GET') {
        const id = await observationStore?.latestId();
        const latest = id && (await observationStore.read(id));
        send(response, latest ? 200 : 404, latest || { error: 'No observation records yet' });
        return true;
      }
      const match = path.match(/^\/api\/observations\/([a-f0-9-]{36})(\/replay)?$/);
      const report = match && (await observationStore?.read(match[1]));
      if (!report || report.version !== 'live-town-v1') {
        send(response, 404, { error: 'Observation not found' });
        return true;
      }
      if (request.method === 'GET' && !match[2]) {
        send(
          response,
          200,
          report.status === 'running' && !activeAudits.has(report.id)
            ? { ...report, status: 'interrupted' }
            : report,
        );
        return true;
      }
      if (request.method === 'POST' && match[2]) {
        try {
          send(response, 200, await replayObservation(report));
        } catch {
          send(response, 400, { error: 'Audit is incomplete or inconsistent' });
        }
        return true;
      }
      send(response, 405, { error: 'Method not allowed' });
      return true;
    }
    if (path === '/api/status' && request.method === 'GET') {
      send(response, 200, {
        mode: config.enabled ? 'ai' : 'demo',
        model: config.enabled ? config.model : null,
        maxCalls: config.maxCalls,
      });
      return true;
    }
    if (path === '/api/config' && request.method === 'GET') {
      send(response, 200, publicSettings(config));
      return true;
    }
    if (['/api/config', '/api/config/test'].includes(path) && request.method === 'POST') {
      if (!request.headers['content-type']?.startsWith('application/json')) {
        send(response, 415, { error: 'Use JSON.', code: 'json-required' });
        return true;
      }
      let candidate;
      try {
        candidate = validateSettings(await readBody(request), config);
      } catch {
        send(response, 400, { error: 'Invalid API settings.', code: 'invalid-settings' });
        return true;
      }
      if (path === '/api/config') {
        try {
          if (settingsStore) await settingsStore.write(candidate);
          config = candidate;
          send(response, 200, publicSettings(config));
        } catch {
          send(response, 500, { error: 'Unable to save local settings.', code: 'save-failed' });
        }
      } else {
        if (activeCalls >= 2 || totalCalls + reservedCalls >= 120) {
          send(response, 429, { error: 'Request budget exceeded.', code: 'budget-exceeded' });
          return true;
        }
        activeCalls++;
        totalCalls++;
        try {
          await testConnection(candidate);
          send(response, 200, { ok: true, model: candidate.model });
        } catch {
          send(response, 502, {
            error: 'Connection failed. Check endpoint, model and key.',
            code: 'connection-failed',
          });
        } finally {
          activeCalls--;
        }
      }
      return true;
    }
    if (path !== '/api/turn' || request.method !== 'POST') {
      send(response, 404, { error: '接口不存在。' });
      return true;
    }
    if (!request.headers['content-type']?.startsWith('application/json')) {
      send(response, 415, { error: '请使用 JSON 请求。' });
      return true;
    }
    let body;
    try {
      body = await readBody(request, 524_288);
    } catch (error) {
      send(response, error.message === 'body-too-large' ? 413 : 400, {
        error: '请求数据无效或过大。',
      });
      return true;
    }
    if (body?.executionMode !== 'live' && Buffer.byteLength(JSON.stringify(body)) > 262_144) {
      send(response, 413, { error: 'Request too large.' });
      return true;
    }
    if (
      !body ||
      (body.language !== undefined && !['zh', 'en'].includes(body.language)) ||
      typeof body.gameId !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(body.gameId) ||
      !Number.isInteger(body.round) ||
      body.round < 0 ||
      body.round >= (body.residents ? 72 : 12) ||
      !validConversations(body.conversations, body.residents !== undefined) ||
      (body.residents !== undefined &&
        (!validLifeContext(body.residents) ||
          !body.conversations.every((meeting) => {
            const sender = body.residents.find((person) => person.id === meeting.senderId);
            const receiver = body.residents.find((person) => person.id === meeting.receiverId);
            const source = sender?.sources?.find((item) => item.id === meeting.sourceId);
            return (
              sender &&
              receiver &&
              sender !== receiver &&
              (meeting.kind === 'chat'
                ? meeting.sourceId === null
                : source && source.evidence === meeting.evidence)
            );
          })))
    ) {
      send(response, 400, { error: '回合数据无效。' });
      return true;
    }
    if (
      body.executionMode === 'live' &&
      (!body.residents ||
        !validateGame(body.state) ||
        body.state.executionMode !== 'live' ||
        body.state.id !== body.gameId ||
        body.state.round !== body.round ||
        !/^[a-f0-9-]{36}$/.test(body.attemptId || '') ||
        !body.snapshot?.actors ||
        !body.residents.every((person) => {
          const actor = body.snapshot.actors[person.id];
          return (
            actor &&
            Number.isFinite(actor.x) &&
            Number.isFinite(actor.y) &&
            actor.x >= 0 &&
            actor.x <= 1152 &&
            actor.y >= 0 &&
            actor.y <= 800
          );
        }))
    ) {
      send(response, 400, { error: 'Invalid live observation state' });
      return true;
    }
    if (body.executionMode === 'live' && !observationStore) {
      send(response, 503, { error: 'Live audit storage is unavailable' });
      return true;
    }
    if (body.residents === undefined && Buffer.byteLength(JSON.stringify(body)) > 16_384) {
      send(response, 413, { error: 'Request too large.' });
      return true;
    }
    if (!config.enabled) {
      send(
        response,
        body.executionMode === 'live' ? 503 : 200,
        body.executionMode === 'live'
          ? { error: '请先配置真实模型 API。' }
          : { mode: 'demo', replies: [] },
      );
      return true;
    }
    const timestamp = now();
    for (const [id, game] of games) {
      if (timestamp - game.updated > 3_600_000 && !game.inFlight) games.delete(id);
    }
    if (!games.has(body.gameId) && games.size >= 100) {
      send(response, 429, { error: '本地会话已达上限，请稍后再试。' });
      return true;
    }
    if (body.executionMode === 'live' && !games.has(body.gameId)) {
      if (!gameLoads.has(body.gameId))
        gameLoads.set(body.gameId, observationStore.ledger(body.gameId));
      try {
        const ledger = await gameLoads.get(body.gameId);
        if (!games.has(body.gameId))
          games.set(body.gameId, {
            calls: ledger.calls,
            rounds: new Set(ledger.rounds),
            attempts: new Set(ledger.attempts),
            updated: timestamp,
            inFlight: false,
          });
      } catch {
        send(response, 503, { error: 'Audit ledger unavailable' });
        return true;
      } finally {
        gameLoads.delete(body.gameId);
      }
    }
    const game = games.get(body.gameId) || {
      calls: 0,
      rounds: new Set(),
      updated: timestamp,
      inFlight: false,
    };
    const requiredCalls = body.residents ? observationCallCount(body.conversations) : 1;
    if (
      game.calls + requiredCalls > config.maxCalls ||
      totalCalls + reservedCalls + requiredCalls > 120
    ) {
      send(response, 429, {
        error: '剩余请求额度不足以完成本次交流，观察已暂停。',
        budget: {
          used: game.calls,
          limit: config.maxCalls,
          remaining: config.maxCalls - game.calls,
        },
      });
      return true;
    }
    if (game.inFlight || activeCalls >= 2 || game.rounds.has(body.round)) {
      send(response, 429, { error: '该回合正在处理或已调用过模型。' });
      return true;
    }
    game.attempts ||= new Set();
    if (body.executionMode === 'live' && game.attempts.has(body.attemptId)) {
      send(response, 429, { error: 'This attempt was already submitted' });
      return true;
    }
    if (body.executionMode === 'live') game.attempts.add(body.attemptId);
    game.rounds.add(body.round);
    game.updated = timestamp;
    game.inFlight = true;
    games.set(body.gameId, game);
    let remainingReservations = requiredCalls;
    reservedCalls += requiredCalls;
    const turnAbort = new AbortController();
    const cancelTurn = () => {
      if (!response.writableEnded) turnAbort.abort();
    };
    response.once('close', cancelTurn);
    const reserve = () => {
      turnAbort.signal.throwIfAborted();
      if (
        remainingReservations <= 0 ||
        game.calls >= config.maxCalls ||
        totalCalls >= 120 ||
        activeCalls >= 2
      )
        throw new Error('Provider budget exhausted');
      remainingReservations--;
      reservedCalls--;
      game.calls++;
      activeCalls++;
      totalCalls++;
      return () => {
        activeCalls--;
      };
    };
    let observationAudit;
    try {
      let output;
      if (body.residents) {
        if (body.executionMode === 'live') {
          observationAudit = await createObservationAudit(observationStore, config, body);
          activeAudits.add(observationAudit.report.id);
        }
        const result = await observe(
          config,
          body.conversations,
          body.residents,
          body.language || 'zh',
          { reserve, signal: turnAbort.signal, audit: observationAudit?.hooks },
        );
        if (observationAudit) await observationAudit.finish(result);
        output = {
          mode: 'ai',
          ...result,
          ...(observationAudit
            ? {
                auditId: observationAudit.report.id,
                replayVerified: observationAudit.report.replayVerified,
              }
            : {}),
        };
      } else {
        const release = reserve();
        try {
          output = { mode: 'ai', replies: await generate(config, body.conversations) };
        } finally {
          release();
        }
      }
      send(response, 200, {
        ...output,
        budget: {
          used: game.calls,
          limit: config.maxCalls,
          remaining: config.maxCalls - game.calls,
        },
      });
    } catch (error) {
      if (observationAudit) {
        try {
          await observationAudit.fail(error);
        } catch {
          /* Storage failures must not become a successful run. */
        }
      }
      if (body.executionMode === 'live') game.rounds.delete(body.round);
      // Provider details can contain credentials or private infrastructure URLs.
      send(response, 502, {
        error: '模型请求失败或返回格式无效；未完成的模型对话未提交。',
        ...(observationAudit ? { auditId: observationAudit.report.id } : {}),
        budget: {
          used: game.calls,
          limit: config.maxCalls,
          remaining: config.maxCalls - game.calls,
        },
      });
    } finally {
      game.inFlight = false;
      if (observationAudit) activeAudits.delete(observationAudit.report.id);
      reservedCalls -= remainingReservations;
      response.removeListener('close', cancelTurn);
    }
    return true;
  };
}
