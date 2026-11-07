import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { replayModelStudy } from '../server/model-study.mjs';
import { runTrial } from '../src/simulation/experiments.js';

const file = (path) => new URL(`../${path}`, import.meta.url);
const json = async (path) => JSON.parse(await readFile(file(path), 'utf8'));

test('published artifact bytes match the declared hashes and contain no credential fields', async () => {
  const manifest = await json('docs/results/manifest.json');
  for (const [name, hash] of Object.entries(manifest.artifacts)) {
    const data = await readFile(file(`docs/results/${name}`));
    assert.equal(createHash('sha256').update(data).digest('hex'), hash, name);
    if (name.endsWith('.json'))
      assert.ok(
        !/sk-[A-Za-z0-9]{20,}|"(?:apiKey|Authorization)"\s*:/i.test(data.toString('utf8')),
        name,
      );
  }
});
test('public complete model trace replays offline; reported totals match every recorded response', async () => {
  const report = await json('docs/results/live-pilot-v2.json'),
    summary = await json('docs/results/live-pilot-summary.json');
  assert.equal(replayModelStudy(report).ok, true);
  assert.equal(report.calls.length, 16);
  assert.equal(summary.taskSeeds, 1);
  assert.equal(
    summary.usage.total,
    report.calls.reduce((sum, c) => sum + c.response.usage.total_tokens, 0),
  );
  assert.equal(summary.usage.total, 17480);
  assert.equal(summary.durationSeconds, 67.092);
  assert.deepEqual(
    summary.score.map((s) => s.correctAgents.length),
    [4, 0],
  );
  const failed = await json('docs/results/live-pilot-v1-failed.json');
  assert.equal(failed.status, 'failed');
  assert.equal(failed.calls.length, 5);
  assert.throws(() => replayModelStudy(failed));
});
test('rule artifact contains all paired seeds and still reproduces from the current engine', async () => {
  const raw = JSON.parse(gunzipSync(await readFile(file('docs/results/rules-trials.json.gz'))));
  const summary = await json('docs/results/rules-summary.json');
  assert.equal(raw.trials.length, 120);
  assert.deepEqual(raw.summary, summary.summary);
  for (const policy of ['none', 'random', 'degree', 'bridge']) {
    const example = raw.trials.find((t) => t.policy === policy);
    assert.deepEqual(runTrial(raw.config, example.seed, policy), example);
  }
  const readmes = await Promise.all(
    ['docs/results/README.md'].map((p) => readFile(file(p), 'utf8')),
  );
  for (const group of raw.summary) {
    const mean = (group.metrics.sourceCoverage.mean * 100).toFixed(1) + '%';
    const auc = (group.metrics.sourceAuc.mean * 100).toFixed(1) + '%';
    for (const readme of readmes) {
      assert.ok(readme.includes(mean));
      assert.ok(readme.includes(auc));
    }
  }
});
