import { BUILDINGS, TILE, createMap, isWalkable, locationAt } from '../game/map.js';
import { personText, placeText } from '../i18n.js';

let visionMap;
const roomAt = (p) =>
  BUILDINGS.find(
    (b) => p.x / TILE > b.x && p.x / TILE < b.x + b.w && p.y / TILE > b.y && p.y / TILE < b.y + b.h,
  )?.id;

export function visibleFrom(a, b) {
  if (!a || !b || Math.hypot(a.x - b.x, a.y - b.y) > TILE * 6 || roomAt(a) !== roomAt(b))
    return false;
  visionMap ||= createMap();
  const steps = Math.max(1, Math.ceil(Math.hypot(a.x - b.x, a.y - b.y) / 4));
  for (let i = 1; i < steps; i++) {
    const x = Math.floor((a.x + ((b.x - a.x) * i) / steps) / TILE);
    const y = Math.floor((a.y + ((b.y - a.y) * i) / steps) / TILE);
    if (!isWalkable(visionMap, x, y)) return false;
  }
  return true;
}

export function perceiveTown(game, snapshot, id) {
  const self = snapshot?.actors?.[id];
  if (!self) return [];
  const observations = Object.entries(snapshot.actors)
    .filter(([other, actor]) => other !== id && visibleFrom(self, actor))
    .sort(
      ([, a], [, b]) =>
        Math.hypot(a.x - self.x, a.y - self.y) - Math.hypot(b.x - self.x, b.y - self.y),
    )
    .slice(0, 5)
    .map(([other, actor]) => ({
      id: `near-${game.round}-${id}-${other}`,
      subjectId: other,
      round: game.round,
      kind: 'observation',
      text: `我看到${personText(other, 'name', 'zh')}在附近${actor.moving ? '走动' : '停留'}。`,
      textEn: `I saw ${personText(other, 'name', 'en')} ${actor.moving ? 'walking' : 'nearby'}.`,
    }));
  const place = BUILDINGS.find((b) => b.name === locationAt(self.x / TILE, self.y / TILE));
  if (place && observations.length < 5)
    observations.push({
      id: `place-${game.round}-${id}`,
      round: game.round,
      kind: 'observation',
      text: `我正在${place.name}，可以在这里停留或完成自己的活动。`,
      textEn: `I am at ${placeText(place.id, 'en')}, where I can stay or carry out my activity.`,
    });
  return observations;
}
