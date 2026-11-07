import { getScenario } from './scenarios.js';
import { RESIDENTS, residentById } from './scenario.js';
import { BUILDINGS, locationAt } from '../game/map.js';
import { retrieveMemories } from './memory.js';
import { placeText } from '../i18n.js';
import { perceiveTown } from './perception.js';
export const LIFE_PLACES = [
  ...BUILDINGS.map((b) => ({ id: b.id, name: b.name, tile: b.home })),
  { id: 'square', name: '钟楼小广场', tile: [38, 17] },
  { id: 'river', name: '河畔步道', tile: [51, 20] },
];
const GOALS = {
  lin: '照顾咖啡馆的生意，也留意邻里的消息',
  mei: '安排孩子明天的上学和家里的生活',
  zhou: '照顾花草，为邻居准备春日花束',
  qiao: '备课，并向有疑问的家长解释学校安排',
  tang: '散步，看看老朋友有什么需要帮忙的',
  chen: '修理自行车，工作之余找朋友聊天',
  xu: '整理书籍，帮助邻居核对消息来源',
  bo: '收集社区新闻，采访不同的人并核对说法',
};
export function validResidentIntention(p) {
  return Boolean(
    p &&
    residentById(p?.id) &&
    LIFE_PLACES.some((place) => place.id === p.place) &&
    typeof p.activity === 'string' &&
    p.activity.trim().length > 0 &&
    p.activity.length <= 100 &&
    typeof p.reason === 'string' &&
    p.reason.length <= 200 &&
    (p.activityEn === undefined ||
      (typeof p.activityEn === 'string' && p.activityEn.length <= 120)) &&
    (p.reasonEn === undefined || (typeof p.reasonEn === 'string' && p.reasonEn.length <= 240)) &&
    (p.talkTo === null || (residentById(p.talkTo) && p.talkTo !== p.id)),
  );
}
export function validIntentions(items) {
  return (
    Array.isArray(items) &&
    items.length === RESIDENTS.length &&
    new Set(items.map((p) => p?.id)).size === RESIDENTS.length &&
    items.every(validResidentIntention)
  );
}
export function demoIntentions(game) {
  const scene = getScenario(game);
  return RESIDENTS.map((person, index) => {
    const goal = person.goal || GOALS[person.id],
      social = (game.round + index) % 4 === 1;
    if (scene.place && person.id === scene.sourceHolder) {
      const contact =
        person.links.find((id) => game.residents[id].claim === null) ||
        person.links[game.round % person.links.length];
      return {
        id: person.id,
        place: scene.place,
        kind: 'social',
        activity:
          scene.id === 'spring-party'
            ? '准备茶点，把茶会邀请告诉邻居'
            : '照顾栗子，向邻居说明目击线索',
        activityEn:
          scene.id === 'spring-party'
            ? 'Prepare tea and invite the neighbors'
            : 'Look after Chestnut and share the sighting',
        reason: scene.fact,
        reasonEn: scene.factEn,
        talkTo: contact,
      };
    }
    const schedule = game.minds?.[person.id]?.schedule;
    const scheduled = schedule?.findLast(
      (s) => Number(s.time.slice(0, 2)) * 60 + Number(s.time.slice(3)) <= 540 + game.round * 10,
    );
    const place = social
      ? 'square'
      : (game.round + index) % 5 === 2
        ? 'cafe'
        : scheduled?.place || person.home;
    const informed = game.residents[person.id];
    if (scene.place && informed.claim !== null && game.round >= (scene.startRound || 1) - 1) {
      const searchWrongPlace = scene.id === 'lost-cat' && !informed.verified;
      return {
        id: person.id,
        place: searchWrongPlace ? 'river' : scene.place,
        kind: 'visit',
        activity: searchWrongPlace ? '沿河寻找栗子的踪迹' : scene.activity,
        activityEn: searchWrongPlace ? 'Look for Chestnut along the river' : scene.activityEn,
        reason: searchWrongPlace ? '我听说栗子在河边，但还没有核实。' : scene.reason,
        reasonEn: searchWrongPlace
          ? 'I heard the cat was near the river, but have not checked the source.'
          : scene.reasonEn,
        talkTo: social ? person.links[game.round % person.links.length] : null,
      };
    }
    const kind = social ? 'social' : place === 'cafe' && person.home !== 'cafe' ? 'break' : 'work';
    return {
      id: person.id,
      place,
      kind,
      activity:
        kind === 'social'
          ? '散步，找邻居聊聊近况'
          : kind === 'break'
            ? '去咖啡馆歇一会儿'
            : goal.split('，')[0],
      activityEn:
        kind === 'social'
          ? 'Take a walk and catch up with neighbors'
          : kind === 'break'
            ? 'Take a break at the café'
            : person.goalEn.split(/[,.]/)[0],
      reason: goal,
      reasonEn: person.goalEn,
      talkTo: social ? person.links[game.round % person.links.length] : null,
    };
  });
}
export function lifeContext(game, snapshot) {
  return RESIDENTS.map((person) => {
    const actor = snapshot?.actors?.[person.id],
      locale = game.language || 'zh',
      goal = person.goal || GOALS[person.id];
    const retrieved = retrieveMemories(
      game.minds?.[person.id],
      `${goal} ${game.intentions?.find((p) => p.id === person.id)?.activity || ''}`,
      game.round,
    );
    const recent = game.messages
      .filter((m) => m.receiver === person.id || m.sender === person.id)
      .slice(-3);
    const records = retrieved.length
      ? retrieved
      : recent.map((m) => ({
          id: `msg-${m.id}`,
          kind: 'message',
          round: m.round,
          importance: m.evidence ? 10 : 6,
          text: m.text,
          textEn: m.textEn || '',
        }));
    return {
      id: person.id,
      name: locale === 'en' ? person.nameEn : person.name,
      personality: locale === 'en' ? person.traitEn : person.trait,
      goal: locale === 'en' ? person.goalEn : goal,
      location:
        locale === 'en'
          ? actor
            ? placeText(
                BUILDINGS.find((b) => b.name === locationAt(actor.x / 16, actor.y / 16))?.id ||
                  'river',
                'en',
              )
            : placeText(person.home, 'en')
          : actor
            ? locationAt(actor.x / 16, actor.y / 16)
            : BUILDINGS.find((b) => b.id === person.home).name,
      memories: records.map((m) => (locale === 'en' && m.textEn ? m.textEn : m.text).slice(0, 160)),
      memoryRecords: records.map((m) => ({
        id: m.id,
        kind: m.kind,
        round: m.round,
        importance: m.importance,
        text: (locale === 'en' && m.textEn ? m.textEn : m.text).slice(0, 160),
      })),
      reflections: (game.minds?.[person.id]?.reflections || []).slice(-2).map((r) => ({
        text: (locale === 'en' && r.textEn ? r.textEn : r.text).slice(0, 160),
        evidenceIds: r.evidenceIds,
      })),
      schedule: game.minds?.[person.id]?.schedule || [],
      round: game.round,
      intention:
        game.intentions?.find((item) => item.id === person.id) ||
        demoIntentions(game).find((item) => item.id === person.id),
      observations: perceiveTown(game, snapshot, person.id),
      sources: game.messages
        .filter((message) => message.receiver === person.id)
        .filter(
          (message, index, all) =>
            index >= all.length - 5 || message.id === game.residents[person.id].messageId,
        )
        .map(({ id, claim, evidence, text, textEn }) => ({
          id,
          claim,
          evidence,
          text: text.slice(0, 500),
          textEn: (textEn || '').slice(0, 500),
        })),
      claimMeanings:
        game.residents[person.id].claim === null
          ? []
          : (game.residents[person.id].verified ? [0] : [1, 2, 3]).map((id) => ({
              id,
              text: locale === 'en' ? getScenario(game).claimsEn[id] : getScenario(game).claims[id],
            })),
    };
  });
}
export function validLifeContext(items) {
  return (
    Array.isArray(items) &&
    items.length === RESIDENTS.length &&
    new Set(items.map((p) => p?.id)).size === RESIDENTS.length &&
    items.every(
      (p) =>
        residentById(p?.id) &&
        ['name', 'personality', 'goal', 'location'].every(
          (k) => typeof p[k] === 'string' && p[k].length > 0 && p[k].length <= 200,
        ) &&
        Array.isArray(p.memories) &&
        p.memories.length <= 6 &&
        p.memories.every((m) => typeof m === 'string' && m.length <= 160) &&
        (p.memoryRecords === undefined ||
          (Array.isArray(p.memoryRecords) &&
            p.memoryRecords.length <= 6 &&
            p.memoryRecords.every(
              (m) =>
                m &&
                typeof m.id === 'string' &&
                m.id.length <= 100 &&
                typeof m.text === 'string' &&
                m.text.length <= 160 &&
                Number.isInteger(m.round) &&
                Number.isFinite(m.importance),
            ))) &&
        (p.reflections === undefined ||
          (Array.isArray(p.reflections) &&
            p.reflections.length <= 2 &&
            p.reflections.every(
              (r) =>
                r &&
                typeof r.text === 'string' &&
                r.text.length <= 160 &&
                Array.isArray(r.evidenceIds) &&
                r.evidenceIds.length <= 6 &&
                r.evidenceIds.every((id) => typeof id === 'string' && id.length <= 100),
            ))) &&
        (p.schedule === undefined ||
          (Array.isArray(p.schedule) &&
            p.schedule.length <= 12 &&
            p.schedule.every(
              (s) =>
                s &&
                typeof s.time === 'string' &&
                s.time.length <= 5 &&
                LIFE_PLACES.some((place) => place.id === s.place) &&
                typeof s.kind === 'string' &&
                s.kind.length <= 20,
            ))) &&
        (p.observations === undefined ||
          (Array.isArray(p.observations) &&
            p.observations.length <= 5 &&
            p.observations.every(
              (o) =>
                o &&
                typeof o.id === 'string' &&
                o.id.length <= 100 &&
                ['text', 'textEn'].every(
                  (key) => typeof o[key] === 'string' && o[key].length <= 240,
                ),
            ))) &&
        (p.sources === undefined ||
          (Array.isArray(p.sources) &&
            p.sources.length <= 6 &&
            new Set(p.sources.map((source) => source?.id)).size === p.sources.length &&
            p.sources.every(
              (source) =>
                source &&
                typeof source.id === 'string' &&
                source.id.length <= 100 &&
                [0, 1, 2, 3].includes(source.claim) &&
                source.evidence === (source.claim === 0) &&
                ['text', 'textEn'].every(
                  (key) => typeof source[key] === 'string' && source[key].length <= 500,
                ),
            ))) &&
        (p.round === undefined || (Number.isInteger(p.round) && p.round >= 0 && p.round <= 72)) &&
        (p.claimMeanings === undefined ||
          (Array.isArray(p.claimMeanings) &&
            p.claimMeanings.length <= 4 &&
            p.claimMeanings.every(
              (meaning) =>
                meaning &&
                [0, 1, 2, 3].includes(meaning.id) &&
                typeof meaning.text === 'string' &&
                meaning.text.length <= 500,
            ))) &&
        (p.intention === undefined ||
          (p.intention.id === p.id && validResidentIntention(p.intention))),
    )
  );
}

export function recordStoryProgress(game, snapshot) {
  const scene = getScenario(game),
    arrivals = [...(game.storyProgress?.arrivals || [])];
  if (!scene.place || game.round < scene.startRound) return { arrivals };
  const room = BUILDINGS.find((b) => b.id === scene.place);
  for (const person of RESIDENTS) {
    if (arrivals.some((p) => p.id === person.id)) continue;
    const state = game.residents[person.id],
      actor = snapshot?.actors?.[person.id];
    if (state.claim === null || !actor || (scene.id === 'lost-cat' && !state.verified)) continue;
    if (
      actor.x / 16 > room.x &&
      actor.x / 16 < room.x + room.w &&
      actor.y / 16 > room.y &&
      actor.y / 16 < room.y + room.h
    )
      arrivals.push({ id: person.id, round: game.round });
  }
  return { arrivals };
}
