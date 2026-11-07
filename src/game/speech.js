import { RESIDENTS } from '../simulation/scenario.js';

const residents = new Set(RESIDENTS.map((person) => person.id));
const conversations = (game) => [...game.messages, ...(game.encounters || [])];

// Presentation only: reading a committed message never advances the simulation.
export function createSpeechPlayback(initialGame) {
  let gameId = initialGame.id;
  let seen = new Set(conversations(initialGame).map((message) => message.id));
  let messages = [];
  let remaining = 0;
  let queues = [];
  return {
    sync(game) {
      if (game.id !== gameId) {
        gameId = game.id;
        seen = new Set(conversations(game).map((message) => message.id));
        messages = [];
        remaining = 0;
        queues = [];
        return;
      }
      const fresh = conversations(game).filter(
        (message) =>
          !seen.has(message.id) && residents.has(message.sender) && residents.has(message.receiver),
      );
      for (const message of conversations(game)) seen.add(message.id);
      if (!fresh.length) return;
      const grouped = fresh.filter((message) => message.dialogue);
      if (grouped.length) {
        const sessions = new Map();
        for (const message of grouped) {
          if (!sessions.has(message.dialogue.id)) sessions.set(message.dialogue.id, []);
          sessions.get(message.dialogue.id).push(message);
        }
        queues = [...sessions.values()].slice(-3).map((turns) => ({
          turns: turns.sort((a, b) => a.dialogue.turn - b.dialogue.turn),
          index: 0,
          remaining: 6,
        }));
        messages = [];
        return;
      }
      queues = [];
      messages = fresh.slice(-3);
      remaining = 10;
    },
    tick(seconds, paused) {
      if (paused) return;
      if (queues.length) {
        for (const queue of queues) {
          queue.remaining -= seconds;
          while (queue.remaining <= 0 && queue.index < queue.turns.length) {
            queue.index++;
            queue.remaining += 6;
          }
        }
        queues = queues.filter((queue) => queue.index < queue.turns.length);
        return;
      }
      remaining = Math.max(0, remaining - seconds);
      if (!remaining) messages = [];
    },
    dismiss(id) {
      if (!id) queues = [];
      else {
        for (const queue of queues)
          if (queue.turns[queue.index]?.id === id) {
            queue.index++;
            queue.remaining = 6;
          }
        queues = queues.filter((queue) => queue.index < queue.turns.length);
      }
      messages = id ? messages.filter((message) => message.id !== id) : [];
      if (!messages.length) remaining = 0;
    },
    get messages() {
      return queues.length ? queues.map((queue) => queue.turns[queue.index]) : messages;
    },
  };
}

// Place readable HTML cards in CSS pixels, independently of map zoom.
export function layoutSpeechBubbles(speeches, width, height) {
  const compact = width <= 700;
  const cardWidth = Math.min(264, width - 24);
  const cardHeight = 148;
  const left = width > 760 ? 300 : 12;
  const top = height > 450 ? 170 : 8;
  const bottom = Math.max(top, height - (height > 450 ? 125 : 8) - cardHeight);
  const right = Math.max(left, width - cardWidth - 12);
  const placed = [];
  for (const speech of speeches.slice(0, compact ? 1 : 3)) {
    const clampX = (x) => Math.max(left, Math.min(right, x));
    const clampY = (y) => Math.max(top, Math.min(bottom, y));
    const candidates = [
      { x: clampX(speech.x - cardWidth / 2), y: clampY(speech.y - cardHeight - 20) },
      { x: clampX(speech.x + 24), y: clampY(speech.y - cardHeight / 2) },
      { x: clampX(speech.x - cardWidth - 24), y: clampY(speech.y - cardHeight / 2) },
    ];
    for (let y = top; y <= bottom; y += cardHeight + 12)
      for (const x of [left, right]) candidates.push({ x, y });
    const score = (point) => {
      const overlap = placed.reduce(
        (sum, other) =>
          sum +
          Math.max(
            0,
            Math.min(point.x + cardWidth + 8, other.left + cardWidth + 8) -
              Math.max(point.x, other.left),
          ) *
            Math.max(
              0,
              Math.min(point.y + cardHeight + 8, other.top + cardHeight + 8) -
                Math.max(point.y, other.top),
            ),
        0,
      );
      return (
        overlap * 1000 +
        Math.hypot(point.x + cardWidth / 2 - speech.x, point.y + cardHeight - speech.y)
      );
    };
    candidates.sort((a, b) => score(a) - score(b));
    const point = candidates[0];
    placed.push({ ...speech, left: point.x, top: point.y, width: cardWidth, height: cardHeight });
  }
  return placed;
}
