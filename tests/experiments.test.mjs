import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXPERIMENT,
  POLICIES,
  networkScores,
  runTrial,
  runExperiment,
  validateExperiment,
  estimate,
  experimentCsv,
} from '../src/simulation/experiments.js';
import { createExploreGame } from '../src/game/session.js';
import { interventionTarget } from '../src/simulation/experiments.js';

const config = { ...DEFAULT_EXPERIMENT, seeds: 5, rounds: 8 };
test('directed centrality distinguishes contacts from shortest-path bridges', () => {
  const scores = networkScores([
    { id: 'a', links: ['b', 'c'] },
    { id: 'b', links: ['d'] },
    { id: 'c', links: ['d'] },
    { id: 'd', links: [] },
  ]);
  assert.equal(scores.a.degree, 2);
  assert.equal(scores.a.bridge, 0);
  assert.equal(scores.d.bridge, 0);
  assert.ok(Math.abs(scores.b.bridge - 1 / 12) < 1e-12);
  assert.equal(scores.b.bridge, scores.c.bridge);
});
test('bounded configurations reject excessive batches and invalid horizons before work starts', () => {
  assert.ok(validateExperiment(config));
  for (const broken of [
    { ...config, seeds: 0 },
    { ...config, seeds: 101 },
    { ...config, rounds: 100 },
    { ...config, interventionRound: 8 },
    { ...config, seedStart: 4294967294 },
    { ...config, seedStart: NaN },
  ]) {
    assert.equal(validateExperiment(broken), false);
    assert.throws(() => runExperiment(broken));
  }
});
test('all policies share the initial trajectory and active policies spend exactly one notice', () => {
  const trials = POLICIES.map((policy) => runTrial(config, 1000, policy));
  for (const trial of trials) {
    assert.equal(trial.interventionsUsed, trial.policy === 'none' ? 0 : 1);
    assert.deepEqual(
      trial.history.slice(0, config.interventionRound),
      trials[0].history.slice(0, config.interventionRound),
    );
    assert.deepEqual(
      trial.messages.filter((m) => m.round < config.interventionRound),
      trials[0].messages.filter((m) => m.round < config.interventionRound),
    );
    const intervention = trial.messages.find((m) => m.kind === 'intervention');
    assert.equal(Boolean(intervention), trial.policy !== 'none');
    if (intervention) {
      assert.equal(intervention.receiver, trial.target);
      assert.equal(intervention.round, config.interventionRound);
    }
    const known = new Map(trial.messages.map((m) => [m.id, m]));
    for (const m of trial.messages)
      if (m.parentId) {
        const parent = known.get(m.parentId);
        assert.equal(parent.receiver, m.sender);
        assert.equal(parent.evidence, m.evidence);
        assert.ok(parent.round < m.round);
      }
  }
});
test('structural policies select the highest eligible score rather than an already informed resident', () => {
  const game = createExploreGame(),
    scores = networkScores();
  for (const policy of ['degree', 'bridge']) {
    const id = interventionTarget(game, policy, scores);
    assert.equal(game.residents[id].verified, false);
    for (const person of Object.keys(game.residents))
      if (!game.residents[person].verified) assert.ok(scores[id][policy] >= scores[person][policy]);
  }
});
test('reports, resampling and raw trials reproduce exactly without model or network dependencies', () => {
  let completed = 0;
  const report = runExperiment(config, (n, total) => {
    completed = n;
    assert.equal(total, 20);
  });
  assert.equal(completed, 20);
  assert.deepEqual(report, runExperiment(config));
  assert.equal(report.modelCalls, 0);
  assert.equal(report.mode, 'rules-only-abstract-network');
  assert.equal(report.trials.length, 20);
  assert.equal(report.graph.length, 25);
  for (const trial of report.trials)
    assert.deepEqual(trial, runTrial(config, trial.seed, trial.policy));
  for (const group of report.summary) {
    const trials = report.trials.filter((t) => t.policy === group.policy),
      expected = trials.reduce((sum, t) => sum + t.metrics.sourceCoverage, 0) / config.seeds;
    assert.equal(group.metrics.sourceCoverage.mean, expected);
    assert.equal(group.curve.length, config.rounds + 1);
    assert.equal(group.curve.at(-1).sourceCoverage, expected);
  }
  for (const pair of report.paired) {
    const differences = report.trials
      .filter((t) => t.policy === pair.policy)
      .map(
        (t) =>
          t.metrics.sourceAuc -
          report.trials.find((r) => r.policy === 'random' && r.seed === t.seed).metrics.sourceAuc,
      );
    assert.deepEqual(pair.difference, estimate(differences, config.seedStart));
  }
  assert.equal(experimentCsv(report).split('\n').length, 21);
});
test('constant bootstrap samples have a zero-width interval and estimates stay reproducible', () => {
  assert.deepEqual(estimate([0.4, 0.4, 0.4, 0.4, 0.4]), { mean: 0.4, low: 0.4, high: 0.4, n: 5 });
  assert.deepEqual(estimate([0, 1, 2, 3, 4]), estimate([0, 1, 2, 3, 4]));
  assert.throws(() => estimate([]));
});
