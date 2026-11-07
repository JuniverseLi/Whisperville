import { readFile } from 'node:fs/promises';
import { replayModelStudy } from '../server/model-study.mjs';
const path = process.argv[2];
if (!path || path === '--help')
  console.log(
    'npm run replay:model -- path/to/live-report.json\nVerifies recorded inputs, outputs and scores locally. No model requests.',
  );
else {
  try {
    const content = await readFile(path, 'utf8');
    if (content.length > 4000000) throw new Error();
    const replay = replayModelStudy(JSON.parse(content));
    console.log(JSON.stringify(replay, null, 2));
  } catch {
    console.error(
      'Replay failed: incomplete, altered or unsupported trace. No model calls were made.',
    );
    process.exitCode = 1;
  }
}
