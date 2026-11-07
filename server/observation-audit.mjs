import { randomUUID, createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { createStudyStore } from './model-study.mjs';
import { generatePrivateObservation } from './cognition.mjs';
import { advanceCognitiveTurn } from '../src/simulation/cognition.js';
import { propagationSnapshot } from '../src/simulation/propagation.js';
import { LIVE_VERSION } from '../src/simulation/live.js';

export const observationHash = (value) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function createObservationStore(directory) {
  const store = createStudyStore(directory);
  return {
    ...store,
    async ledger(gameId) {
      let entries;
      try {
        entries = await readdir(directory);
      } catch (error) {
        if (error.code === 'ENOENT') return { calls: 0, rounds: [], attempts: [] };
        throw error;
      }
      const reports = await Promise.all(
        entries
          .filter((name) => /^[a-f0-9-]{36}\.json$/.test(name))
          .map((name) => store.read(name.slice(0, -5))),
      );
      const own = reports.filter(
        (report) => report?.version === LIVE_VERSION && report.before?.state?.id === gameId,
      );
      return {
        calls: own.reduce((sum, report) => sum + report.calls.length, 0),
        rounds: own
          .filter((report) => report.status === 'completed')
          .map((report) => report.before.state.round),
        attempts: own.map((report) => report.attemptId).filter(Boolean),
      };
    },
  };
}
const codeFor = (error) =>
  ['provider-error', 'output-truncated', 'invalid-content'].includes(error?.message)
    ? error.message
    : /abort|cancel/i.test(error?.name || '')
      ? 'cancelled'
      : 'invalid-or-unavailable-response';
const usage = (value) =>
  Object.fromEntries(
    ['prompt_tokens', 'completion_tokens', 'total_tokens'].map((key) => [
      key,
      Number.isInteger(value?.[key]) && value[key] >= 0 ? value[key] : null,
    ]),
  );

export async function createObservationAudit(store, config, input) {
  const clean = (value) =>
    JSON.parse(
      config.apiKey
        ? JSON.stringify(value).split(config.apiKey).join('[REDACTED]')
        : JSON.stringify(value),
    );
  const report = {
    id: randomUUID(),
    version: LIVE_VERSION,
    model: config.model,
    attemptId: input.attemptId || null,
    status: 'running',
    startedAt: new Date().toISOString(),
    before: clean({
      state: input.state,
      snapshot: input.snapshot,
      residents: input.residents,
      conversations: input.conversations,
      language: input.language || 'zh',
    }),
    calls: [],
  };
  const save = () => store.write(report);
  await save();
  return {
    report,
    hooks: {
      async before(request, residentId, turn) {
        const call = {
          index: report.calls.length,
          residentId,
          turn,
          startedAt: new Date().toISOString(),
          status: 'pending',
          request: clean(request),
          requestHash: observationHash(clean(request)),
        };
        report.calls.push(call);
        await save();
        return call;
      },
      async received(call, response) {
        call.response = clean({
          content: response.content,
          usage: usage(response.usage),
          finishReason: response.finishReason,
          servedModel: response.servedModel,
          responseId: response.responseId,
        });
        call.status = 'received';
        await save();
      },
      async validated(call, action) {
        call.action = clean(action);
        call.status = 'ok';
        call.durationMs = Date.now() - Date.parse(call.startedAt);
        await save();
      },
      async failed(call, error) {
        call.status = 'failed';
        call.errorCode = codeFor(error);
        call.durationMs = Date.now() - Date.parse(call.startedAt);
        await save();
      },
    },
    async finish(result) {
      report.result = clean(result);
      report.outcome = advanceCognitiveTurn(
        report.before.state,
        result.sessions,
        report.before.snapshot,
      );
      report.metrics = {
        before: propagationSnapshot(report.before.state).metrics,
        after: propagationSnapshot(report.outcome).metrics,
      };
      report.status = 'completed';
      report.finishedAt = new Date().toISOString();
      report.replayVerified = (await replayObservation(report)).ok;
      await save();
    },
    async fail(error) {
      report.status = codeFor(error) === 'cancelled' ? 'cancelled' : 'failed';
      report.errorCode = codeFor(error);
      report.finishedAt = new Date().toISOString();
      await save();
    },
  };
}

export async function replayObservation(report) {
  if (
    report?.version !== LIVE_VERSION ||
    report.status !== 'completed' ||
    !report.calls?.length ||
    !report.before?.state
  )
    throw new Error('Incomplete live observation');
  let index = 0;
  const provider = async (config, request) => {
    const call = report.calls[index++];
    if (
      !call ||
      call.status !== 'ok' ||
      call.requestHash !== observationHash(request) ||
      call.requestHash !== observationHash(call.request) ||
      !call.response
    )
      throw new Error('Observation trace mismatch');
    const action = JSON.parse(
      call.response.content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, ''),
    );
    if (observationHash(action) !== observationHash(call.action))
      throw new Error('Observation action mismatch');
    return call.response;
  };
  const result = await generatePrivateObservation(
    { model: report.model },
    report.before.conversations,
    report.before.residents,
    report.before.language,
    { provider },
  );
  if (index !== report.calls.length || observationHash(result) !== observationHash(report.result))
    throw new Error('Observation result mismatch');
  const outcome = advanceCognitiveTurn(
    report.before.state,
    result.sessions,
    report.before.snapshot,
  );
  if (observationHash(outcome) !== observationHash(report.outcome))
    throw new Error('Observation outcome mismatch');
  return {
    ok: true,
    modelCalls: 0,
    round: outcome.round,
    metrics: propagationSnapshot(outcome).metrics,
  };
}
