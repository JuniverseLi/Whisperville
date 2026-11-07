import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  MODEL_STUDY_VERSION,
  STUDY_AGENTS,
  STUDY_CONDITIONS,
  STUDY_ROUNDS,
  STUDY_OUTPUT_TOKENS,
  callsForStudy,
  validStudyOptions,
  createStudyTrial,
  studyRequest,
  parseStudyAction,
  finishStudyRound,
  scoreStudyTrial,
} from '../src/simulation/model-study.js';

const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const supportedVersion = (version) =>
  ['private-number-pilot-v1', MODEL_STUDY_VERSION].includes(version);
const validId = (id) => /^[a-f0-9-]{36}$/.test(id);
const cleanUsage = (value) =>
  Object.fromEntries(
    ['prompt_tokens', 'completion_tokens', 'total_tokens'].map((key) => [
      key,
      Number.isInteger(value?.[key]) && value[key] >= 0 ? value[key] : null,
    ]),
  );

export async function callStudyProvider(config, body, signal) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  if (!response.ok) throw new Error('provider-error');
  const data = await response.json(),
    content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.length > 16000) throw new Error('invalid-content');
  return {
    content,
    usage: cleanUsage(data.usage),
    finishReason:
      typeof data.choices?.[0]?.finish_reason === 'string'
        ? data.choices[0].finish_reason.slice(0, 100)
        : null,
    servedModel: typeof data.model === 'string' ? data.model.slice(0, 200) : null,
    responseId: typeof data.id === 'string' ? data.id.slice(0, 200) : null,
  };
}

export function createStudyStore(directory) {
  let pending = Promise.resolve();
  return {
    write(report) {
      if (!validId(report.id)) return Promise.reject(new Error('invalid-id'));
      const content = JSON.stringify(report, null, 2),
        file = resolve(directory, `${report.id}.json`);
      pending = pending
        .catch(() => {})
        .then(async () => {
          await mkdir(directory, { recursive: true });
          await writeFile(`${file}.tmp`, content, { mode: 0o600 });
          await rename(`${file}.tmp`, file);
        });
      return pending;
    },
    async latestId() {
      try {
        const entries = await readdir(directory, { withFileTypes: true });
        const records = await Promise.all(
          entries
            .filter((e) => e.isFile() && e.name.endsWith('.json') && validId(e.name.slice(0, -5)))
            .map(async (e) => ({
              id: e.name.slice(0, -5),
              time: (await stat(resolve(directory, e.name))).mtimeMs,
            })),
        );
        return records.sort((a, b) => b.time - a.time)[0]?.id || null;
      } catch {
        return null;
      }
    },
    async read(id) {
      if (!validId(id)) return null;
      try {
        const content = await readFile(resolve(directory, `${id}.json`), 'utf8');
        return content.length <= 4000000 ? JSON.parse(content) : null;
      } catch {
        return null;
      }
    },
  };
}

export function replayModelStudy(report) {
  if (
    !supportedVersion(report?.version) ||
    report.status !== 'completed' ||
    !validStudyOptions(report.options) ||
    !Array.isArray(report.calls) ||
    report.calls.length !== callsForStudy(report.options.seeds)
  )
    throw new Error('Incomplete report');
  let index = 0;
  const trials = [];
  for (
    let seed = report.options.seedStart;
    seed < report.options.seedStart + report.options.seeds;
    seed++
  )
    for (const condition of STUDY_CONDITIONS) {
      const trial = createStudyTrial(seed, condition);
      for (let round = 0; round < STUDY_ROUNDS; round++) {
        const actions = [];
        for (const id of STUDY_AGENTS) {
          const call = report.calls[index++],
            request = studyRequest(
              trial,
              id,
              round,
              report.model,
              report.options.language,
              report.maxOutputTokensPerCall,
            );
          if (
            call.status !== 'ok' ||
            call.agent !== id ||
            call.seed !== seed ||
            call.condition !== condition ||
            call.round !== round ||
            call.requestHash !== hash(request) ||
            hash(call.request) !== hash(request)
          )
            throw new Error('Trace mismatch');
          const action = parseStudyAction(call.response.content, id);
          if (hash(action) !== hash(call.action)) throw new Error('Action mismatch');
          actions.push({ id, action });
        }
        finishStudyRound(trial, round, actions);
      }
      trials.push({ ...trial, score: scoreStudyTrial(trial) });
    }
  if (hash(trials) !== hash(report.trials)) throw new Error('Result mismatch');
  return {
    ok: true,
    mode: 'recorded-response-replay',
    modelCalls: 0,
    trials: trials.map((t) => ({ seed: t.seed, condition: t.condition, score: t.score })),
  };
}

export function createModelStudyApi({
  getConfig,
  reserve,
  remaining,
  send,
  readBody,
  store = null,
  provider = callStudyProvider,
}) {
  const jobs = new Map(),
    clients = new Map();
  let active = null;
  const save = (report) => store?.write(report) || Promise.resolve();
  async function find(id) {
    if (jobs.has(id)) return jobs.get(id).report;
    const report = await store?.read(id);
    if (
      !report ||
      report.id !== id ||
      !supportedVersion(report.version) ||
      !validStudyOptions(report.options) ||
      !Array.isArray(report.calls) ||
      report.calls.length > 48 ||
      !Array.isArray(report.trials) ||
      report.trials.length > 6 ||
      !report.trials.every((t) => t && Array.isArray(t.messages))
    )
      return null;
    if (['queued', 'running'].includes(report.status))
      return { ...report, status: 'interrupted', errorCode: 'server-restarted' };
    return report;
  }
  async function execute(job, config) {
    const report = job.report,
      signal = job.controller.signal;
    const redact = (text) => (config.apiKey ? text.split(config.apiKey).join('[REDACTED]') : text);
    try {
      report.status = 'running';
      await save(report);
      for (
        let seed = report.options.seedStart;
        seed < report.options.seedStart + report.options.seeds;
        seed++
      )
        for (const condition of STUDY_CONDITIONS) {
          const trial = createStudyTrial(seed, condition);
          report.trials.push(trial);
          for (let round = 0; round < STUDY_ROUNDS; round++) {
            const actions = [];
            for (const id of STUDY_AGENTS) {
              if (signal.aborted) throw new Error('cancelled');
              const request = studyRequest(trial, id, round, config.model, report.options.language),
                release = reserve();
              const call = {
                seed,
                condition,
                round,
                agent: id,
                status: 'pending',
                request,
                requestHash: hash(request),
                startedAt: new Date().toISOString(),
              };
              report.calls.push(call);
              const started = Date.now();
              try {
                await save(report);
                if (signal.aborted) throw new Error('cancelled');
                const response = await provider(config, request, signal);
                call.response = {
                  content: redact(response.content),
                  usage: cleanUsage(response.usage),
                  finishReason: response.finishReason || null,
                  servedModel:
                    typeof response.servedModel === 'string' ? redact(response.servedModel) : null,
                  responseId:
                    typeof response.responseId === 'string' ? redact(response.responseId) : null,
                };
                if (response.finishReason === 'length') throw new Error('output-truncated');
                call.action = parseStudyAction(call.response.content, id);
                call.status = 'ok';
                actions.push({ id, action: call.action });
              } catch (error) {
                call.status = signal.aborted ? 'cancelled' : 'failed';
                call.errorCode = signal.aborted
                  ? 'cancelled'
                  : ['provider-error', 'output-truncated'].includes(error.message)
                    ? error.message
                    : 'invalid-or-unavailable-response';
                throw error;
              } finally {
                call.durationMs = Date.now() - started;
                release();
                await save(report);
              }
            }
            finishStudyRound(trial, round, actions);
            await save(report);
          }
          trial.score = scoreStudyTrial(trial);
          await save(report);
        }
      report.status = 'completed';
      report.replayVerified = replayModelStudy(report).ok;
    } catch (error) {
      report.status = signal.aborted ? 'cancelled' : 'failed';
      report.errorCode = signal.aborted
        ? 'cancelled'
        : ['process-budget', 'provider-busy', 'output-truncated'].includes(error.message)
          ? error.message
          : 'request-or-output-failed';
    } finally {
      report.finishedAt = new Date().toISOString();
      try {
        await save(report);
      } catch {
        report.status = 'failed';
        report.errorCode = 'audit-write-failed';
      }
      if (active === report.id) active = null;
    }
  }
  return async (request, response, path) => {
    if (!path.startsWith('/api/model-studies')) return false;
    if (path === '/api/model-studies/status' && request.method === 'GET') {
      const c = getConfig();
      send(response, 200, {
        configured: c.enabled,
        version: MODEL_STUDY_VERSION,
        outputTokenCap: STUDY_OUTPUT_TOKENS,
        model: c.enabled ? c.model : null,
        callsPerSeed: callsForStudy(1),
        remainingProcessCalls: remaining(),
        activeStudyId: active,
        latestStudyId: [...jobs.keys()].at(-1) || (await store?.latestId?.()) || null,
      });
      return true;
    }
    if (path === '/api/model-studies' && request.method === 'POST') {
      let body;
      try {
        if (!request.headers['content-type']?.startsWith('application/json')) throw new Error();
        body = await readBody(request, 8192);
      } catch {
        send(response, 400, { code: 'invalid-study' });
        return true;
      }
      const options = { seedStart: body?.seedStart, seeds: body?.seeds, language: body?.language };
      if (
        !validStudyOptions(options) ||
        typeof body.clientId !== 'string' ||
        !validId(body.clientId)
      ) {
        send(response, 400, { code: 'invalid-study' });
        return true;
      }
      if (clients.has(body.clientId)) {
        const old = await find(clients.get(body.clientId));
        if (JSON.stringify(old.options) !== JSON.stringify(options)) {
          send(response, 409, { code: 'duplicate-client-id' });
          return true;
        }
        send(response, 202, { id: old.id });
        return true;
      }
      const c = { ...getConfig() },
        plannedCalls = callsForStudy(options.seeds);
      if (!c.enabled) {
        send(response, 503, { code: 'not-configured' });
        return true;
      }
      if (active) {
        send(response, 409, { code: 'study-active' });
        return true;
      }
      if (jobs.size >= 20 || remaining() < plannedCalls) {
        send(response, 429, { code: 'process-budget' });
        return true;
      }
      const report = {
        id: randomUUID(),
        version: MODEL_STUDY_VERSION,
        mode: 'live-api',
        model: c.model,
        status: 'queued',
        options,
        plannedCalls,
        maxOutputTokensPerCall: STUDY_OUTPUT_TOKENS,
        startedAt: new Date().toISOString(),
        protocol: {
          agents: STUDY_AGENTS,
          rounds: STUDY_ROUNDS,
          conditions: STUDY_CONDITIONS,
          scheduling: 'synchronous-rounds',
          privateContexts: true,
          automaticRetries: 0,
          ruleFallback: false,
          training: false,
        },
        calls: [],
        trials: [],
      };
      active = report.id;
      try {
        await save(report);
      } catch {
        if (active === report.id) active = null;
        send(response, 500, { code: 'audit-write-failed' });
        return true;
      }
      const job = { report, controller: new AbortController() };
      jobs.set(report.id, job);
      clients.set(body.clientId, report.id);
      active = report.id;
      send(response, 202, { id: report.id });
      queueMicrotask(() => execute(job, c));
      return true;
    }
    const match = path.match(/^\/api\/model-studies\/([a-f0-9-]{36})(?:\/(cancel|replay))?$/);
    if (match) {
      const report = await find(match[1]);
      if (!report) {
        send(response, 404, { code: 'study-not-found' });
        return true;
      }
      if (!match[2] && request.method === 'GET') {
        send(response, 200, report);
        return true;
      }
      if (match[2] === 'cancel' && request.method === 'POST') {
        jobs.get(report.id)?.controller.abort();
        send(response, 200, { ok: true });
        return true;
      }
      if (match[2] === 'replay' && request.method === 'POST') {
        try {
          send(response, 200, replayModelStudy(report));
        } catch {
          send(response, 400, { code: 'replay-mismatch-or-incomplete' });
        }
        return true;
      }
    }
    send(response, 404, { code: 'study-not-found' });
    return true;
  };
}
