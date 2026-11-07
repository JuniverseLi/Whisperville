import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { runExperiment, DEFAULT_EXPERIMENT, experimentCsv } from '../src/simulation/experiments.js';
const options = { ...DEFAULT_EXPERIMENT };
const names = {
  '--seeds': 'seeds',
  '--rounds': 'rounds',
  '--seed-start': 'seedStart',
  '--intervention-round': 'interventionRound',
};
const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    'npm run experiment -- [--seeds 30] [--rounds 12] [--seed-start 1000] [--intervention-round 2]\nOffline rules only. Writes output/experiments/report.json and trials.csv.',
  );
} else {
  try {
    for (let i = 0; i < args.length; i += 2) {
      if (!names[args[i]] || args[i + 1] === undefined) throw new Error('Unknown option');
      options[names[args[i]]] = Number(args[i + 1]);
    }
    const report = runExperiment(options),
      directory = resolve('output', 'experiments');
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'report.json'), JSON.stringify(report, null, 2));
    await writeFile(resolve(directory, 'trials.csv'), experimentCsv(report));
    console.table(
      report.summary.map((s) => ({
        policy: s.policy,
        sourceCoverage: s.metrics.sourceCoverage.mean.toFixed(3),
        sourceAuc: s.metrics.sourceAuc.mean.toFixed(3),
        messages: s.metrics.messages.mean.toFixed(1),
      })),
    );
    console.log(`Saved ${report.trials.length} rule-based trials to ${directory}; no model calls.`);
  } catch {
    console.error('Invalid experiment options. Run npm run experiment -- --help.');
    process.exitCode = 1;
  }
}
