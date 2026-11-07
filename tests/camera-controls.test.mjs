import test from 'node:test';
import assert from 'node:assert/strict';
import { attachCameraControls } from '../src/game/camera-controls.js';

function setup() {
  const listeners = new Map(),
    pans = [],
    zooms = [],
    taps = [],
    changes = [];
  let allowed = true,
    starts = 0,
    capture = null;
  const canvas = {
    dataset: {},
    addEventListener: (key, fn) => listeners.set(key, fn),
    removeEventListener: (key) => listeners.delete(key),
    getBoundingClientRect: () => ({ left: 10, top: 20, height: 500 }),
    setPointerCapture: (id) => {
      capture = id;
    },
    hasPointerCapture: (id) => capture === id,
    releasePointerCapture: () => {
      capture = null;
    },
  };
  const dispose = attachCameraControls(canvas, {
    enabled: () => allowed,
    onTap: (e) => taps.push(e),
    onPanStart: () => starts++,
    onPan: (x, y) => pans.push([x, y]),
    onZoom: (...args) => zooms.push(args),
    onChange: (kind) => changes.push(kind),
  });
  const fire = (key, extra = {}) =>
    listeners.get(key)?.({
      pointerId: 1,
      button: 0,
      isPrimary: true,
      clientX: 100,
      clientY: 100,
      preventDefault() {},
      ...extra,
    });
  return {
    canvas,
    fire,
    pans,
    zooms,
    taps,
    changes,
    dispose,
    listeners,
    starts: () => starts,
    capture: () => capture,
    disable: () => {
      allowed = false;
    },
  };
}

test('a small movement remains a tap; a captured drag pans and never selects a resident', () => {
  const s = setup();
  s.fire('pointerdown');
  assert.equal(s.capture(), 1);
  s.fire('pointermove', { clientX: 103 });
  s.fire('pointerup', { clientX: 103 });
  assert.equal(s.taps.length, 1);
  assert.equal(s.starts(), 0);
  s.fire('pointerdown');
  s.fire('pointermove', { clientX: 130, clientY: 115 });
  s.fire('pointermove', { clientX: 170, clientY: 125 });
  s.fire('pointerup', { clientX: 170, clientY: 125 });
  assert.deepEqual(s.pans, [
    [30, 15],
    [40, 10],
  ]);
  assert.equal(s.starts(), 1);
  assert.equal(s.taps.length, 1);
  assert.equal(s.canvas.dataset.dragging, 'false');
  assert.equal(s.capture(), null);
  s.dispose();
  assert.equal(s.listeners.size, 0);
});

test('cancellation, unrelated pointers, right buttons and blocked modals cannot trigger a tap', () => {
  const s = setup();
  s.fire('pointerdown', { button: 2 });
  s.fire('pointerup');
  assert.equal(s.taps.length, 0);
  s.fire('pointerdown');
  s.fire('pointermove', { pointerId: 2, clientX: 300 });
  assert.equal(s.pans.length, 0);
  s.fire('pointercancel');
  s.fire('pointerup');
  assert.equal(s.taps.length, 0);
  s.fire('pointerdown');
  s.disable();
  s.fire('pointermove', { clientX: 150 });
  s.fire('pointerup');
  assert.equal(s.pans.length, 0);
  assert.equal(s.taps.length, 0);
  s.fire('pointerdown');
  assert.equal(s.capture(), null);
  s.dispose();
});

test('wheel zoom uses local pointer coordinates, normalizes line units and bounds extreme deltas', () => {
  const s = setup();
  s.fire('wheel', { deltaY: -3, deltaMode: 1, clientX: 210, clientY: 220 });
  assert.deepEqual(s.zooms[0].slice(1), [200, 200]);
  assert.ok(s.zooms[0][0] > 1);
  s.fire('wheel', { deltaY: 1e12, deltaMode: 0 });
  assert.equal(s.zooms[1][0], Math.exp(-0.8));
  s.disable();
  s.fire('wheel', { deltaY: 100 });
  assert.equal(s.zooms.length, 2);
  s.dispose();
});
