// A controlled contact sequence for explaining the diagram; no models or map travel.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createExploreGame } from '../src/game/session.js';
import { advanceTurn } from '../src/simulation/engine.js';
import { demoIntentions } from '../src/simulation/life.js';
import { seedMinds, updateMinds } from '../src/simulation/memory.js';

let game = createExploreGame(42, 'school-closure');
game.id = 'walkthrough-seed42-v1';
game.observer = true;
game.lifeMode = 'demo';
game.recordingMode = 'scripted-rule-walkthrough';
game.minds = seedMinds(game);
const contacts = [
  ['lin', 'mei'],
  ['mei', 'chen'],
  ['chen', 'kai'],
  ['qiao', 'mei'],
  ['mei', 'chen'],
  ['lin', 'bo'],
  ['bo', 'luna'],
  ['qiao', 'ivy'],
];
for (const [sender, receiver] of contacts) {
  const intentions = demoIntentions(game).map((p) => ({
    ...p,
    talkTo: p.id === sender ? receiver : null,
  }));
  const next = advanceTurn(game, [], intentions);
  next.minds = updateMinds(game, next);
  game = next;
}
game.intentions = demoIntentions(game);
const target = process.argv[2] || 'docs/examples/propagation-walkthrough.json';
await mkdir(dirname(target), { recursive: true });
await writeFile(target, JSON.stringify(game, null, 2) + '\n');
console.log(
  `Saved ${game.messages.length} committed rule messages from a fixed contact sequence to ${target}. No provider calls.`,
);
