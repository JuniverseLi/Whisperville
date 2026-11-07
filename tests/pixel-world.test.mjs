import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelWorld } from '../src/game/world.js';
import { createExploreGame, createPlayer } from '../src/game/session.js';
import { advanceTurn } from '../src/simulation/engine.js';
import { createMap, isWalkable } from '../src/game/map.js';

test('residents move, recover interrupted meeting routes, and commit actual meetings before forwarding', async (t) => {
  let frameCallback,
    interactions = [],
    snapshots = [],
    committed = 0,
    now = 0;
  const context = new Proxy(
    { measureText: (text) => ({ width: text.length * 9 }) },
    { get: (target, key) => (key in target ? target[key] : () => {}) },
  );
  const canvas = () => ({
    clientWidth: 1280,
    clientHeight: 800,
    dataset: {},
    getContext: () => context,
    addEventListener() {},
    removeEventListener() {},
  });
  const globals = {
    document: { hidden: false, createElement: canvas },
    window: { addEventListener() {}, removeEventListener() {} },
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    Image: class {
      width = 1086;
      height = 1448;
      set src(value) {
        this.onload();
      }
    },
    requestAnimationFrame: (callback) => {
      frameCallback = callback;
      return 1;
    },
    cancelAnimationFrame() {},
  };
  let world;
  t.after(() => world?.dispose());
  for (const [key, value] of Object.entries(globals)) {
    const previous = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
    t.after(() => {
      if (previous) Object.defineProperty(globalThis, key, previous);
      else delete globalThis[key];
    });
  }
  const game = createExploreGame();
  const state = {
    game,
    player: { ...createPlayer(game.id), introSeen: true },
    blocked: false,
    busy: false,
    quest: { target: 'lin' },
  };
  const map = createMap();
  world = createPixelWorld(canvas(), {
    getState: () => state,
    onInteract: (id) => {
      interactions.push(id);
      state.blocked = true;
      state.dialogNpc = id;
    },
    onSnapshot: (snapshot) => snapshots.push(snapshot),
    onCycleComplete: () => {
      if (state.observer) state.blocked = true;
    },
    onConversation: () => {
      // No resident should pass through a wall or share from across the map.
      const actors = world.snapshot().actors;
      const before = state.game;
      state.game = advanceTurn(before);
      const messages = state.game.messages.slice(before.messages.length);
      for (const message of messages) {
        const sender = actors.find((actor) => actor.id === message.sender),
          receiver = actors.find((actor) => actor.id === message.receiver);
        assert.ok(Math.hypot(sender.x - receiver.x, sender.y - receiver.y) < 16 * 1.9);
      }
      committed++;
    },
  });
  async function tick(milliseconds) {
    for (let step = 0; step < milliseconds; step += 33) {
      now += 33;
      frameCallback(now);
      await Promise.resolve();
    }
  }
  const initial = world.snapshot();
  await tick(15000);
  assert.ok(
    world
      .snapshot()
      .actors.some(
        (actor, index) =>
          Math.hypot(actor.x - initial.actors[index].x, actor.y - initial.actors[index].y) > 5,
      ),
  );
  // Interrupt Lin while the first conversation batch is still travelling.
  world.goToNpc('lin');
  await tick(20000);
  assert.ok(interactions.includes('lin'));
  state.blocked = false;
  state.dialogNpc = null;
  await tick(150000);
  assert.ok(committed >= 2, `conversation batch stalled: ${committed}`);
  for (const snapshot of snapshots)
    for (const actor of Object.values(snapshot.actors))
      assert.ok(isWalkable(map, Math.floor(actor.x / 16), Math.floor(actor.y / 16)));
  assert.ok(state.game.messages.some((message) => message.evidence && message.parentId));
  // Observer single-step commits and immediately pauses; speech must still synchronize.
  state.observer = true;
  state.speed = 4;
  world.dismissSpeech();
  for (let step = 0; step < 3000 && !state.blocked; step++) await tick(33);
  assert.ok(state.blocked, 'observer meeting should complete and pause');
  await tick(500);
  assert.ok(
    snapshots.at(-1).speeches.length > 0,
    'paused single-step must expose committed speech',
  );
  const heldActors = world.snapshot().actors;
  await tick(12000);
  assert.ok(snapshots.at(-1).speeches.length > 0, 'pause preserves readable dialogue');
  assert.deepEqual(world.snapshot().actors, heldActors);
  state.blocked = false;
  await tick(6000);
  assert.ok(snapshots.at(-1).speeches.length > 0, '4x speed must not shorten reading time');
  assert.deepEqual(
    world.snapshot().actors,
    heldActors,
    'neighbors stay at the meeting while reading',
  );
  world.dismissSpeech();
  await tick(4000);
  assert.ok(
    world
      .snapshot()
      .actors.some(
        (actor, index) => actor.x !== heldActors[index].x || actor.y !== heldActors[index].y,
      ),
  );
});
