import { BUILDINGS } from '../game/map.js';
import { RESIDENTS } from './scenario.js';

export const COGNITION_VERSION = 'private-life-v1';
export const DIALOGUE_TURNS = 4;
export const timeAtRound = (round) => {
  const minutes = 540 + round * 10;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};
export const minutesAt = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

export function validScheduleChange(change, round) {
  return Boolean(
    change &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(change.time) &&
    minutesAt(change.time) >= 540 + round * 10 &&
    minutesAt(change.time) <= 23 * 60 + 50 &&
    ['work', 'social', 'meal'].includes(change.kind) &&
    ['square', 'river', ...BUILDINGS.map((b) => b.id)].includes(change.place) &&
    Number.isInteger(change.duration) &&
    change.duration >= 10 &&
    change.duration <= 120 &&
    ['reason', 'reasonEn'].every(
      (key) =>
        typeof change[key] === 'string' &&
        change[key].trim().length > 0 &&
        change[key].length <= 200,
    ) &&
    Array.isArray(change.evidenceIds) &&
    change.evidenceIds.length > 0 &&
    change.evidenceIds.length <= 6 &&
    change.evidenceIds.every((id) => typeof id === 'string' && id.length <= 120),
  );
}

export function applyDayPlans(game, changes = [], snapshot) {
  for (const person of RESIDENTS) {
    const mind = game.minds[person.id];
    mind.planChanges ||= [];
    for (const slot of mind.schedule) {
      if (!slot.replanned || slot.status === 'completed' || slot.status === 'missed') continue;
      const now = 540 + game.round * 10;
      const place = BUILDINGS.find((b) => b.id === slot.place);
      const actor = snapshot?.actors?.[person.id];
      const destination = place?.home || (slot.place === 'square' ? [38, 17] : [51, 20]);
      const arrived =
        actor &&
        (place
          ? actor.x / 16 > place.x &&
            actor.x / 16 < place.x + place.w &&
            actor.y / 16 > place.y &&
            actor.y / 16 < place.y + place.h
          : Math.hypot(actor.x / 16 - destination[0], actor.y / 16 - destination[1]) < 3);
      if (now >= minutesAt(slot.time) && now < minutesAt(slot.time) + slot.duration && arrived)
        slot.status = 'completed';
      else if (now >= minutesAt(slot.time) + slot.duration) slot.status = 'missed';
    }
    const change = changes.find((item) => item.id === person.id);
    if (!change || !validScheduleChange(change, game.round)) continue;
    const known = new Set(mind.memories.map((memory) => memory.id));
    if (!change.evidenceIds.every((id) => known.has(id))) continue;
    const slot = { ...change, replanned: true, status: 'planned', changedAt: game.round };
    delete slot.id;
    const start = minutesAt(slot.time),
      end = start + slot.duration;
    const replaced = mind.schedule.filter(
      (old) => minutesAt(old.time) >= start && minutesAt(old.time) < end,
    );
    mind.schedule = [...mind.schedule.filter((old) => !replaced.includes(old)), slot]
      .sort((a, b) => minutesAt(a.time) - minutesAt(b.time))
      .slice(-12);
    mind.planChanges.push({
      ...slot,
      replaced: replaced.map((old) => ({ time: old.time, place: old.place })),
    });
    mind.planChanges = mind.planChanges.slice(-12);
  }
  return game;
}
