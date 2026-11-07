import { RESIDENTS } from './scenario.js';
import { createExploreGame } from '../game/session.js';
import { advanceTurn, intervene, random, getStats } from './engine.js';

export const EXPERIMENT_VERSION = 'rule-diffusion-v1';
export const POLICIES = ['none', 'random', 'degree', 'bridge'];
export const DEFAULT_EXPERIMENT = { seedStart: 1000, seeds: 30, rounds: 12, interventionRound: 2 };

export function validateExperiment(config) {
  return Boolean(
    config &&
    Number.isInteger(config.seedStart) &&
    config.seedStart >= 0 &&
    Number.isInteger(config.seeds) &&
    config.seeds >= 5 &&
    config.seeds <= 100 &&
    config.seedStart + config.seeds <= 4294967295 &&
    Number.isInteger(config.rounds) &&
    config.rounds >= 6 &&
    config.rounds <= 36 &&
    Number.isInteger(config.interventionRound) &&
    config.interventionRound >= 1 &&
    config.interventionRound <= 4 &&
    config.interventionRound < config.rounds,
  );
}

// Directed, unweighted Brandes centrality: directions match the actual contact graph.
export function networkScores(people = RESIDENTS) {
  const ids = people.map((p) => p.id),
    known = new Set(ids);
  const links = Object.fromEntries(
    people.map((p) => [p.id, [...new Set(p.links)].filter((id) => id !== p.id && known.has(id))]),
  );
  const between = Object.fromEntries(ids.map((id) => [id, 0]));
  for (const source of ids) {
    const stack = [],
      queue = [source];
    const predecessors = Object.fromEntries(ids.map((id) => [id, []]));
    const paths = Object.fromEntries(ids.map((id) => [id, id === source ? 1 : 0]));
    const distance = Object.fromEntries(ids.map((id) => [id, id === source ? 0 : -1]));
    const dependency = Object.fromEntries(ids.map((id) => [id, 0]));
    for (let i = 0; i < queue.length; i++) {
      const v = queue[i];
      stack.push(v);
      for (const w of links[v]) {
        if (distance[w] < 0) {
          distance[w] = distance[v] + 1;
          queue.push(w);
        }
        if (distance[w] === distance[v] + 1) {
          paths[w] += paths[v];
          predecessors[w].push(v);
        }
      }
    }
    while (stack.length) {
      const w = stack.pop();
      for (const v of predecessors[w]) dependency[v] += (paths[v] / paths[w]) * (1 + dependency[w]);
      if (w !== source) between[w] += dependency[w];
    }
  }
  const divisor = Math.max(1, (ids.length - 1) * (ids.length - 2));
  return Object.fromEntries(
    ids.map((id) => [id, { degree: links[id].length, bridge: between[id] / divisor }]),
  );
}

export function interventionTarget(game, policy, scores) {
  const eligible = RESIDENTS.filter((p) => !game.residents[p.id].verified);
  if (!eligible.length || policy === 'none') return null;
  if (policy === 'random')
    return eligible[Math.floor(random(game.seed ^ 0x504f4c49)() * eligible.length)].id;
  if (!['degree', 'bridge'].includes(policy)) throw new Error('Unknown policy');
  return [...eligible].sort(
    (a, b) => scores[b.id][policy] - scores[a.id][policy] || a.id.localeCompare(b.id, 'en'),
  )[0].id;
}

export function runTrial(config, seed, policy, scores = networkScores()) {
  if (
    !validateExperiment(config) ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 4294967295 ||
    !POLICIES.includes(policy)
  )
    throw new Error('Invalid trial');
  let game = createExploreGame(seed, 'school-closure');
  game.id = `experiment-${seed}-${policy}`;
  game.observer = true;
  let target = null,
    interventionsUsed = 0;
  for (let round = 0; round < config.rounds; round++) {
    if (round === config.interventionRound && policy !== 'none') {
      target = interventionTarget(game, policy, scores);
      const next = intervene(game, target);
      interventionsUsed = game.remaining - next.remaining;
      game = next;
    }
    // Abstract contact network, no map movement, life intentions, model calls or reflections.
    game = advanceTurn(game);
  }
  const stats = getStats(game),
    population = RESIDENTS.length;
  let integral = 0;
  for (let i = 1; i < game.history.length; i++)
    integral += (game.history[i - 1].corrected + game.history[i].corrected) / 2;
  const depths = new Map();
  let maxSourceDepth = 0;
  for (const m of game.messages) {
    const depth = m.parentId === null ? 0 : (depths.get(m.parentId) || 0) + 1;
    depths.set(m.id, depth);
    if (m.evidence) maxSourceDepth = Math.max(maxSourceDepth, depth);
  }
  return {
    seed,
    policy,
    target,
    interventionsUsed,
    metrics: {
      sourceCoverage: stats.corrected / population,
      rumorCoverage: stats.rumor / population,
      sourceAuc: integral / (config.rounds * population),
      messages: game.messages.filter((m) => RESIDENTS.some((p) => p.id === m.sender)).length,
      maxSourceDepth,
    },
    history: game.history,
    messages: game.messages,
  };
}

export function estimate(values, seed = 17) {
  if (!values.length) throw new Error('No samples');
  const mean = values.reduce((a, b) => a + b, 0) / values.length,
    rng = random(seed),
    samples = [];
  for (let b = 0; b < 1000; b++) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) sum += values[Math.floor(rng() * values.length)];
    samples.push(sum / values.length);
  }
  samples.sort((a, b) => a - b);
  return { mean, low: samples[24], high: samples[974], n: values.length };
}

export function summarizeExperiment(config, trials) {
  const summary = POLICIES.map((policy) => {
    const group = trials.filter((t) => t.policy === policy);
    return {
      policy,
      metrics: Object.fromEntries(
        ['sourceCoverage', 'rumorCoverage', 'sourceAuc', 'messages', 'maxSourceDepth'].map(
          (key, index) => [
            key,
            estimate(
              group.map((t) => t.metrics[key]),
              config.seedStart + index,
            ),
          ],
        ),
      ),
      curve: Array.from({ length: config.rounds + 1 }, (_, round) => ({
        round,
        sourceCoverage:
          group.reduce((sum, t) => sum + t.history[round].corrected / RESIDENTS.length, 0) /
          group.length,
        rumorCoverage:
          group.reduce((sum, t) => sum + t.history[round].rumor / RESIDENTS.length, 0) /
          group.length,
      })),
    };
  });
  const randomBySeed = new Map(trials.filter((t) => t.policy === 'random').map((t) => [t.seed, t]));
  const paired = ['degree', 'bridge'].map((policy) => ({
    policy,
    baseline: 'random',
    metric: 'sourceAuc',
    difference: estimate(
      trials
        .filter((t) => t.policy === policy)
        .map((t) => t.metrics.sourceAuc - randomBySeed.get(t.seed).metrics.sourceAuc),
      config.seedStart,
    ),
  }));
  return {
    schemaVersion: 1,
    engineVersion: EXPERIMENT_VERSION,
    mode: 'rules-only-abstract-network',
    population: RESIDENTS.length,
    scenarioId: 'school-closure',
    config: { ...config },
    modelCalls: 0,
    initialConditions: { reliableSource: 'qiao', rumorHolder: 'lin' },
    protocol: {
      topology: 'directed-social-links',
      movement: 'abstract',
      maxContactsPerSegment: 3,
      verifiedSourceProtection: 'engine-enforced',
      policyCandidates: 'currently-unverified',
      interventionTiming: 'after segment r, before segment r+1',
    },
    interval: {
      method: 'percentile-bootstrap',
      quantile: 'nearest-rank',
      resamples: 1000,
      level: 0.95,
      unit: 'paired simulation seed',
    },
    graph: RESIDENTS.map((p) => ({ id: p.id, links: [...p.links], caution: p.caution })),
    assumptions: [
      'Verified sources cannot be overwritten by rumors: an engine rule, not learned behavior.',
      'Contacts use the directed social graph; map travel and life intentions are excluded.',
      'The baseline spends zero interventions; all three intervention policies spend exactly one.',
      'Intervals describe variation across simulated seeds, not uncertainty about human populations.',
      'No models are called or trained; this experiment does not measure LLM cooperation or reproduce s3.',
    ],
    summary,
    paired,
    trials,
  };
}

export function runExperiment(config = DEFAULT_EXPERIMENT, onProgress) {
  if (!validateExperiment(config)) throw new Error('Invalid experiment configuration');
  const scores = networkScores(),
    trials = [];
  for (let i = 0; i < config.seeds; i++)
    for (const policy of POLICIES) {
      trials.push(runTrial(config, config.seedStart + i, policy, scores));
      onProgress?.(trials.length, config.seeds * POLICIES.length);
    }
  return summarizeExperiment(config, trials);
}

export function experimentCsv(report) {
  const columns = [
    'seed',
    'policy',
    'target',
    'interventionsUsed',
    'sourceCoverage',
    'rumorCoverage',
    'sourceAuc',
    'messages',
    'maxSourceDepth',
  ];
  return [
    columns.join(','),
    ...report.trials.map((t) => columns.map((key) => t.metrics[key] ?? t[key] ?? '').join(',')),
  ].join('\n');
}
