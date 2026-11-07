import { RESIDENTS, residentById } from './scenario.js';
import { locationAt, BUILDINGS } from '../game/map.js';
import { perceiveTown } from './perception.js';
import { validScheduleChange } from './day-plan.js';

export function createMinds() {
  return Object.fromEntries(
    RESIDENTS.map((person, index) => [
      person.id,
      {
        memories: [],
        reflections: [],
        schedule: [
          { time: '09:00', place: person.home, kind: 'work' },
          {
            time: `${10 + (index % 2)}:${String((index % 3) * 20).padStart(2, '0')}`,
            place: index % 3 === 0 ? 'library' : 'square',
            kind: 'social',
          },
          { time: `12:${String((index % 4) * 10).padStart(2, '0')}`, place: 'cafe', kind: 'meal' },
          {
            time: `14:${String((index % 3) * 10).padStart(2, '0')}`,
            place: person.home,
            kind: 'work',
          },
        ],
      },
    ]),
  );
}
const terms = (text) => new Set(text.toLowerCase().match(/[a-z]{3,}|[\u3400-\u9fff]/g) || []);
export function retrieveMemories(mind, query, round, limit = 6) {
  const tokens = terms(query);
  return [...(mind?.memories || [])]
    .map((memory) => {
      const own = terms(`${memory.text} ${memory.textEn || ''}`);
      let overlap = 0;
      for (const token of tokens) if (own.has(token)) overlap++;
      return {
        memory,
        score:
          Math.exp(-Math.max(0, round - memory.round) / 12) +
          memory.importance / 10 +
          Math.min(1, overlap / Math.max(1, tokens.size)),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.memory);
}
export function seedMinds(game) {
  const minds = createMinds();
  for (const message of game.messages) {
    const mind = minds[message.receiver];
    if (mind)
      mind.memories.push({
        id: `msg-${message.id}`,
        kind: 'message',
        round: message.round,
        importance: message.evidence ? 10 : 6,
        messageId: message.id,
        text: message.text,
        textEn: message.textEn || '',
      });
  }
  return minds;
}
export function updateMinds(before, game, snapshot, reflections = []) {
  const minds = structuredClone(before.minds || seedMinds(before));
  for (const person of RESIDENTS) {
    const actor = snapshot?.actors?.[person.id],
      mind = minds[person.id];
    if (actor) {
      const place = locationAt(actor.x / 16, actor.y / 16),
        building = BUILDINGS.find((b) => b.name === place);
      const english = building
        ? {
            cafe: 'Duo Café',
            home: 'Riverside Home',
            florist: 'Mu Flower Shop',
            school: 'Whisperville School',
            post: 'Old Post Office',
            workshop: 'Bicycle Workshop',
            library: 'Town Library',
            press: 'Community Press',
          }[building.id]
        : 'the riverside neighborhood';
      mind.memories.push({
        id: `seen-${game.round}-${person.id}`,
        kind: 'observation',
        round: game.round,
        importance: 2,
        text: `这一段我在${place}。`,
        textEn: `I was at ${english} during this segment.`,
      });
      for (const observation of perceiveTown(before, snapshot, person.id)) {
        if (mind.memories.some((memory) => memory.id === observation.id)) continue;
        mind.memories.push({ ...observation, round: game.round, importance: 3 });
      }
    }
    for (const message of game.messages
      .slice(before.messages.length)
      .filter((m) => m.receiver === person.id || m.sender === person.id))
      mind.memories.push({
        id: `msg-${message.id}-${person.id}`,
        kind: 'message',
        round: game.round,
        importance: message.evidence ? 10 : 6,
        messageId: message.id,
        text: message.text,
        textEn: message.textEn || '',
      });
    for (const chat of (game.encounters || []).filter(
      (m) =>
        m.round === game.round &&
        !before.encounters?.some((old) => old.id === m.id) &&
        (m.sender === person.id || m.receiver === person.id),
    ))
      mind.memories.push({
        id: chat.id,
        kind: 'conversation',
        round: chat.round,
        importance: 4,
        messageId: chat.id,
        text: chat.text,
        textEn: chat.textEn || '',
      });
    for (const reflection of reflections.filter((r) => r.id === person.id)) {
      const known = new Set(mind.memories.map((m) => m.id));
      if (!reflection.evidenceIds.every((id) => known.has(id))) continue;
      mind.reflections.push({
        id: `reflection-${game.round}-${person.id}`,
        round: game.round,
        text: reflection.text,
        textEn: reflection.textEn || '',
        evidenceIds: reflection.evidenceIds,
        mode: 'ai',
      });
    }
    mind.memories = mind.memories.slice(-100);
    mind.reflections = mind.reflections.slice(-12);
    const known = new Set(mind.memories.map((m) => m.id));
    mind.reflections = mind.reflections.filter((r) => r.evidenceIds.every((id) => known.has(id)));
  }
  return minds;
}
export function validReflections(items, residents) {
  return (
    Array.isArray(items) &&
    items.length <= 4 &&
    new Set(items.map((r) => r?.id)).size === items.length &&
    items.every(
      (r) =>
        residentById(r?.id) &&
        typeof r.text === 'string' &&
        r.text.trim().length > 0 &&
        r.text.length <= 160 &&
        (r.textEn === undefined || (typeof r.textEn === 'string' && r.textEn.length <= 200)) &&
        Array.isArray(r.evidenceIds) &&
        r.evidenceIds.length > 0 &&
        r.evidenceIds.length <= 6 &&
        r.evidenceIds.every((id) =>
          residents.find((p) => p.id === r.id)?.memoryRecords?.some((m) => m.id === id),
        ),
    )
  );
}
export function validMinds(minds, game) {
  return Boolean(
    minds &&
    Object.keys(minds).length === RESIDENTS.length &&
    RESIDENTS.every((person) => {
      const mind = minds[person.id];
      if (
        !mind ||
        !Array.isArray(mind.memories) ||
        mind.memories.length > 100 ||
        !Array.isArray(mind.reflections) ||
        mind.reflections.length > 12 ||
        !Array.isArray(mind.schedule) ||
        mind.schedule.length < 1 ||
        mind.schedule.length > 12
      )
        return false;
      if (new Set(mind.memories.map((m) => m?.id)).size !== mind.memories.length) return false;
      if (
        mind.planChanges !== undefined &&
        (!Array.isArray(mind.planChanges) ||
          mind.planChanges.length > 12 ||
          !mind.planChanges.every(
            (change) => validScheduleChange(change, 0) && ['ai', 'demo'].includes(change.mode),
          ))
      )
        return false;
      if (
        !mind.schedule.every(
          (slot) =>
            !slot?.replanned ||
            (validScheduleChange(slot, 0) &&
              ['planned', 'completed', 'missed'].includes(slot.status) &&
              Number.isInteger(slot.changedAt) &&
              slot.changedAt >= 0 &&
              slot.changedAt <= game.round),
        )
      )
        return false;
      const memoriesValid = mind.memories.every((m) => {
        if (
          !m ||
          typeof m.id !== 'string' ||
          m.id.length > 100 ||
          !['message', 'observation', 'conversation'].includes(m.kind) ||
          typeof m.text !== 'string' ||
          m.text.length > 500 ||
          typeof m.textEn !== 'string' ||
          m.textEn.length > 500 ||
          !Number.isInteger(m.round) ||
          m.round < 0 ||
          m.round > (game?.round ?? 72) ||
          !Number.isFinite(m.importance) ||
          m.importance < 0 ||
          m.importance > 10
        )
          return false;
        if (game && m.kind === 'conversation') {
          const chat = game.encounters?.find((item) => item.id === m.messageId);
          return Boolean(
            chat &&
            (chat.sender === person.id || chat.receiver === person.id) &&
            chat.text === m.text &&
            chat.round === m.round,
          );
        }
        if (game && m.kind === 'message') {
          const message = game.messages.find((item) => item.id === m.messageId);
          return Boolean(
            message &&
            (message.sender === person.id || message.receiver === person.id) &&
            message.text === m.text &&
            message.round === m.round,
          );
        }
        return true;
      });
      return (
        memoriesValid &&
        mind.schedule.every(
          (slot) =>
            slot &&
            typeof slot.time === 'string' &&
            /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(slot.time) &&
            ['work', 'social', 'meal'].includes(slot.kind) &&
            ['square', 'river', 'cafe', ...BUILDINGS.map((b) => b.id)].includes(slot.place),
        ) &&
        mind.reflections.every(
          (r) =>
            r &&
            typeof r.text === 'string' &&
            r.text.length <= 160 &&
            typeof r.textEn === 'string' &&
            r.textEn.length <= 200 &&
            Array.isArray(r.evidenceIds) &&
            r.evidenceIds.length > 0 &&
            r.evidenceIds.length <= 6 &&
            r.evidenceIds.every((id) => mind.memories.some((m) => m.id === id)),
        )
      );
    }),
  );
}
