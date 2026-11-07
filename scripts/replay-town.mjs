import { readFile } from 'node:fs/promises';
import { replayObservation } from '../server/observation-audit.mjs';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run replay:town -- <audit-or-run.json>');
const input = JSON.parse(await readFile(file, 'utf8'));
const reports = input.observations || [input];
if (!Array.isArray(reports) || !reports.length || reports.length > 100)
  throw new Error('Missing observation records');
const replay = [];
for (const report of reports) replay.push(await replayObservation(report));
console.log(
  JSON.stringify(
    { ok: true, mode: 'recorded-response-replay', modelCalls: 0, segments: replay },
    null,
    2,
  ),
);
