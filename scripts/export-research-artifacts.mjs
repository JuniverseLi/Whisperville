// Copy existing measured data to reviewable public artifacts; never calls a provider.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { resolve, relative } from 'node:path';
import { replayModelStudy } from '../server/model-study.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'node scripts/export-research-artifacts.mjs --rules output/experiments/report.json --model path/to/completed-live-report.json\nOffline only. Writes docs/results/. Copies full task inputs and outputs, excluding response IDs.',
  );
  process.exit(0);
}
const flags = {};
for (let i = 0; i < args.length; i += 2) {
  if (!['--rules', '--model', '--failed'].includes(args[i]) || !args[i + 1])
    throw new Error('Expected --rules and --model paths');
  flags[args[i]] = args[i + 1];
}
if (!flags['--rules'] || !flags['--model']) throw new Error('Provide both reports. Use --help.');
const rules = JSON.parse(await readFile(flags['--rules'], 'utf8')),
  raw = JSON.parse(await readFile(flags['--model'], 'utf8'));
if (rules.mode !== 'rules-only-abstract-network' || rules.trials.length !== rules.config.seeds * 4)
  throw new Error('Invalid rule report');
const replay = replayModelStudy(raw);
// Explicit allowlist excludes endpoint, auth data, arbitrary provider metadata and job identifiers.
const live = {
  version: raw.version,
  mode: raw.mode,
  model: raw.model,
  status: raw.status,
  options: raw.options,
  plannedCalls: raw.plannedCalls,
  maxOutputTokensPerCall: raw.maxOutputTokensPerCall,
  startedAt: raw.startedAt,
  finishedAt: raw.finishedAt,
  protocol: raw.protocol,
  replayVerified: replay.ok,
  calls: raw.calls.map((c) => ({
    seed: c.seed,
    condition: c.condition,
    round: c.round,
    agent: c.agent,
    status: c.status,
    request: c.request,
    requestHash: c.requestHash,
    startedAt: c.startedAt,
    durationMs: c.durationMs,
    response: {
      content: c.response.content,
      usage: c.response.usage,
      finishReason: c.response.finishReason ?? null,
      servedModel: c.response.servedModel ?? null,
    },
    action: c.action,
  })),
  trials: raw.trials,
};
if (/sk-[a-zA-Z0-9]{20,}|"(?:apiKey|authorization)"\s*:/i.test(JSON.stringify(live)))
  throw new Error('Potential credential in report; review manually.');
replayModelStudy(live);
const totals = live.calls.reduce(
  (sum, c) => ({
    prompt: sum.prompt + (c.response.usage.prompt_tokens || 0),
    completion: sum.completion + (c.response.usage.completion_tokens || 0),
    total: sum.total + (c.response.usage.total_tokens || 0),
    unknown: sum.unknown + (c.response.usage.total_tokens === null ? 1 : 0),
  }),
  { prompt: 0, completion: 0, total: 0, unknown: 0 },
);
const dir = resolve('docs/results');
await mkdir(dir, { recursive: true });
const aggregate = { ...rules };
delete aggregate.trials;
const files = {
  'rules-summary.json': JSON.stringify(aggregate, null, 2) + '\n',
  'rules-trials.json.gz': gzipSync(Buffer.from(JSON.stringify(rules)), { level: 9 }),
  'live-pilot-v2.json': JSON.stringify(live, null, 2) + '\n',
  'live-pilot-summary.json':
    JSON.stringify(
      {
        version: live.version,
        model: live.model,
        taskSeeds: live.options.seeds,
        requestedCalls: live.plannedCalls,
        successfulCalls: live.calls.length,
        durationSeconds: (Date.parse(live.finishedAt) - Date.parse(live.startedAt)) / 1000,
        usage: totals,
        score: live.trials.map((t) => ({ seed: t.seed, condition: t.condition, ...t.score })),
        replayVerified: true,
      },
      null,
      2,
    ) + '\n',
};
if (flags['--failed']) {
  const failed = JSON.parse(await readFile(flags['--failed'], 'utf8'));
  if (failed.status !== 'failed') throw new Error('Expected a failed pilot');
  const publicFailure = {
    version: failed.version,
    mode: failed.mode,
    model: failed.model,
    status: failed.status,
    options: failed.options,
    plannedCalls: failed.plannedCalls,
    maxOutputTokensPerCall: failed.maxOutputTokensPerCall,
    startedAt: failed.startedAt,
    finishedAt: failed.finishedAt,
    protocol: failed.protocol,
    errorCode: failed.errorCode,
    calls: failed.calls.map((c) => ({
      seed: c.seed,
      condition: c.condition,
      round: c.round,
      agent: c.agent,
      status: c.status,
      request: c.request,
      requestHash: c.requestHash,
      durationMs: c.durationMs,
      errorCode: c.errorCode,
      response: c.response
        ? {
            content: c.response.content,
            usage: c.response.usage,
            servedModel: c.response.servedModel,
          }
        : null,
      action: c.action,
    })),
    trials: failed.trials,
  };
  if (/sk-[a-zA-Z0-9]{20,}|"(?:apiKey|authorization)"\s*:/i.test(JSON.stringify(publicFailure)))
    throw new Error('Potential credential');
  files['live-pilot-v1-failed.json'] = JSON.stringify(publicFailure, null, 2) + '\n';
}
const hashes = {};
for (const [name, data] of Object.entries(files)) {
  await writeFile(resolve(dir, name), data);
  hashes[name] = createHash('sha256').update(data).digest('hex');
}
await writeFile(
  resolve(dir, 'manifest.json'),
  JSON.stringify(
    {
      schemaVersion: 1,
      artifacts: hashes,
      notes: [
        'Rule report uses a fixed abstract contact graph; no LLM calls.',
        'Live pilot is one task seed with two conditions, not a statistical benchmark.',
        'Public trace preserves exact task prompts and outputs; response IDs and job ID removed.',
        'Hashes verify artifact integrity, not independent verification of the provider model.',
      ],
    },
    null,
    2,
  ) + '\n',
);
console.log(
  JSON.stringify({
    destination: relative(process.cwd(), dir),
    ruleTrials: rules.trials.length,
    liveCalls: live.calls.length,
    replayVerified: true,
    usage: totals,
  }),
);
