import { getScenario } from '../simulation/scenarios.js';
import { createGame, getStats } from '../simulation/engine.js';
import { RESIDENTS } from '../simulation/scenario.js';
import { SPAWN } from './map.js';

export function createExploreGame(seed = 42, scenarioId = 'school-closure') {
  const scene = getScenario(scenarioId);
  const game = createGame(seed, undefined, scene.id);
  game.playMode = 'explore';
  if (!scene.sourceHolder) return game;
  const message = {
    id: `m${game.messages.length}`,
    parentId: null,
    sender: 'notice',
    receiver: scene.sourceHolder,
    round: 0,
    claim: 0,
    confidence: 100,
    evidence: true,
    kind: 'notice',
    textEn: `[${scene.sourceEn}] ${scene.factEn}`,
    text: `【${scene.source}】${scene.fact}`,
    mode: 'demo',
  };
  game.messages.push(message);
  game.residents[scene.sourceHolder] = {
    claim: 0,
    confidence: 100,
    messageId: message.id,
    verified: true,
  };
  game.history[0] = { round: 0, ...getStats(game) };
  return game;
}

export function createPlayer(gameId) {
  return {
    version: 1,
    gameId,
    x: (SPAWN[0] + 0.5) * 16,
    y: (SPAWN[1] + 0.5) * 16,
    introSeen: false,
    visited: [],
    talkedLin: false,
    hasNotice: false,
    shared: [],
    journal: [],
  };
}

export function validPlayer(player, gameId) {
  return Boolean(
    player &&
    player.version === 1 &&
    player.gameId === gameId &&
    Number.isFinite(player.x) &&
    Number.isFinite(player.y) &&
    player.x >= 16 &&
    player.x < 72 * 16 &&
    player.y >= 16 &&
    player.y < 50 * 16 &&
    typeof player.introSeen === 'boolean' &&
    typeof player.talkedLin === 'boolean' &&
    typeof player.hasNotice === 'boolean' &&
    Array.isArray(player.visited) &&
    Array.isArray(player.shared) &&
    Array.isArray(player.journal) &&
    player.journal.length <= 40 &&
    player.visited.length <= RESIDENTS.length &&
    player.shared.length <= RESIDENTS.length &&
    player.visited.every((id) => RESIDENTS.some((resident) => resident.id === id)) &&
    player.shared.every((id) => RESIDENTS.some((resident) => resident.id === id)) &&
    player.journal.every(
      (entry) =>
        entry &&
        typeof entry.text === 'string' &&
        entry.text.length <= 600 &&
        typeof entry.id === 'string',
    ),
  );
}

export function currentQuest(player) {
  if (!player.talkedLin)
    return {
      target: 'lin',
      title: '镇上的第一天',
      text: '和咖啡馆的林朵聊一聊',
      hint: '点击目标，或走近后按 E。',
      action: '去找林朵',
    };
  if (!player.hasNotice)
    return {
      target: 'qiao',
      title: '校园里的风声',
      text: '向乔安确认学校的消息',
      hint: '老师应该知道明天的安排。',
      action: '去找乔安',
    };
  if (!player.shared.length)
    return {
      target: 'mei',
      title: '把消息说清楚',
      text: '把校务公告分享给一位居民',
      hint: '交谈时选择「给你看校务公告」。',
      action: '去找许美',
    };
  return {
    target: null,
    title: '属于你的小镇时光',
    text: '自由探索，认识其他居民',
    hint: '消息也会在邻里之间继续传播。',
    action: '打开小镇地图',
  };
}
