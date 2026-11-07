import test from 'node:test';
import assert from 'node:assert/strict';
import { createSpeechPlayback, layoutSpeechBubbles } from '../src/game/speech.js';

const message = (id, sender = 'lin', receiver = 'mei') => ({
  id,
  sender,
  receiver,
  text: 'Hello',
  round: 1,
});
const game = (messages = [], encounters = []) => ({ id: 'town', messages, encounters });

test('map dialogue shows only new interpersonal records, including ordinary chats', () => {
  const initial = game([message('old')]);
  const playback = createSpeechPlayback(initial);
  playback.sync(initial);
  assert.deepEqual(playback.messages, []);
  const next = game(
    [...initial.messages, message('notice', 'official'), message('new')],
    [message('chat')],
  );
  playback.sync(next);
  assert.deepEqual(
    playback.messages.map((item) => item.id),
    ['new', 'chat'],
  );
  playback.dismiss('new');
  playback.sync(next);
  assert.deepEqual(
    playback.messages.map((item) => item.id),
    ['chat'],
  );
  playback.dismiss();
  playback.sync(next);
  assert.deepEqual(playback.messages, []);
  playback.sync({ ...game([message('different-save')]), id: 'different' });
  assert.deepEqual(playback.messages, []);
});

test('committed speech is available while paused and reading time uses real seconds', () => {
  const playback = createSpeechPlayback(game());
  playback.sync(game([message('new')]));
  playback.tick(20, true);
  assert.equal(playback.messages.length, 1);
  playback.tick(6, false);
  assert.equal(playback.messages.length, 1, 'six real seconds must not become 24 at 4× speed');
  playback.tick(4.1, false);
  assert.equal(playback.messages.length, 0);
  playback.sync(game([message('new')]));
  assert.equal(playback.messages.length, 0, 'expired dialogue must not replay');
});

test('nearby speech cards avoid each other, map chrome and viewport edges', () => {
  const cards = layoutSpeechBubbles(
    [0, 1, 2].map((id) => ({ id, x: 650, y: 400 })),
    1080,
    900,
  );
  assert.equal(cards.length, 3);
  for (let i = 0; i < cards.length; i++) {
    const a = cards[i];
    assert.ok(a.left >= 300 && a.left + a.width <= 1068);
    assert.ok(a.top >= 170 && a.top + a.height <= 775);
    for (const b of cards.slice(i + 1))
      assert.ok(
        a.left + a.width <= b.left ||
          b.left + b.width <= a.left ||
          a.top + a.height <= b.top ||
          b.top + b.height <= a.top,
      );
  }
  const compact = layoutSpeechBubbles(
    [
      { x: 5, y: 10 },
      { x: 180, y: 80 },
    ],
    390,
    224,
  );
  assert.equal(compact.length, 1, 'mobile cycles conversations instead of stacking over the map');
  assert.ok(compact[0].left >= 12 && compact[0].left + compact[0].width <= 378);
  assert.ok(compact[0].top >= 8 && compact[0].top + compact[0].height <= 216);
});

test('multi-turn speech follows actual dialogue order and can step through while paused', () => {
  const playback = createSpeechPlayback(game());
  const records = [0, 1, 2, 3].map((turn) => ({
    ...message(`turn-${turn}`, turn % 2 ? 'mei' : 'lin', turn % 2 ? 'lin' : 'mei'),
    dialogue: { id: 'meeting', turn, total: 4 },
  }));
  playback.sync(game([records[0], records[2]], [records[1], records[3]]));
  assert.equal(playback.messages[0].id, 'turn-0');
  playback.tick(20, true);
  assert.equal(playback.messages[0].id, 'turn-0');
  playback.dismiss('turn-0');
  assert.equal(playback.messages[0].sender, 'mei');
  playback.tick(6.1, false);
  assert.equal(playback.messages[0].id, 'turn-2');
  playback.dismiss();
  assert.deepEqual(playback.messages, []);
});
