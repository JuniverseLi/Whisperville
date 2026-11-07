import { SCENARIOS, getScenario } from './scenarios.js';
import { personText, messageText } from '../i18n.js';
import { RESIDENTS, SCENARIO, residentById } from './scenario.js';
import {
  createVillage,
  planActivities,
  finishActivities,
  validVillage,
  validPosition,
  PLACES,
} from './village.js';

export function random(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let next = Math.imul(value ^ (value >>> 15), 1 | value);
    next ^= next + Math.imul(next ^ (next >>> 7), 61 | next);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function createGame(
  seed = 42,
  id = globalThis.crypto.randomUUID(),
  scenarioId = 'school-closure',
) {
  const scene = getScenario(scenarioId);
  const residents = Object.fromEntries(
    RESIDENTS.map(({ id: residentId }) => [
      residentId,
      { claim: null, confidence: 0, messageId: null, verified: false },
    ]),
  );
  if (scene.rumorHolder)
    residents[scene.rumorHolder] = { claim: 1, confidence: 52, messageId: 'm0', verified: false };
  return {
    version: 1,
    scenarioId: scene.id,
    storyProgress: { arrivals: [] },
    id,
    seed,
    round: 0,
    remaining: SCENARIO.interventions,
    residents,
    village: createVillage(),
    encounters: [],
    messages: scene.rumorHolder
      ? [
          {
            id: 'm0',
            parentId: null,
            sender: 'source',
            receiver: scene.rumorHolder,
            round: 0,
            claim: 1,
            confidence: 52,
            evidence: false,
            kind: 'rumor',
            textEn: scene.rumorEn,
            text: scene.rumor,
            mode: 'demo',
          },
        ]
      : [],
    history: [
      {
        round: 0,
        corrected: 0,
        rumor: scene.rumorHolder ? 1 : 0,
        unaware: RESIDENTS.length - (scene.rumorHolder ? 1 : 0),
      },
    ],
    lastAction: null,
  };
}

export function getStats(game) {
  const states = Object.values(game.residents);
  return {
    corrected: states.filter((state) => state.verified).length,
    rumor: states.filter((state) => state.claim !== null && state.claim !== 0).length,
    unaware: states.filter((state) => state.claim === null).length,
    distorted: states.filter((state) => state.claim >= 2).length,
  };
}

export function isFinished(game) {
  return (
    game.round >= (game.playMode === 'explore' ? 72 : SCENARIO.maxRounds) ||
    (!game.observer && getStats(game).corrected === RESIDENTS.length)
  );
}

function preferredMessage(game, residentId) {
  return game.messages.find((message) => message.id === game.residents[residentId].messageId);
}

// A round is simultaneous: new recipients cannot forward until the next round.
export function planTurn(game, intentions) {
  if (isFinished(game)) return [];
  const scene = getScenario(game);
  const rng = random(game.seed + game.round * 997);
  const senders = RESIDENTS.filter(
    (resident) =>
      game.residents[resident.id].claim !== null ||
      intentions?.some((p) => p.id === resident.id && p.talkTo),
  )
    .map((resident) => ({
      resident,
      priority:
        rng() -
        (scene.place && game.lifeMode !== 'ai' && resident.id === scene.sourceHolder ? 1 : 0),
    }))
    .sort((a, b) => a.priority - b.priority);
  const recipients = new Set();
  const plans = [];
  for (const { resident } of senders) {
    if (plans.length >= (game.cognitionVersion ? 1 : 3)) break;
    if (recipients.has(resident.id)) continue;
    const intent = intentions?.find((item) => item.id === resident.id);
    if (
      intentions &&
      (!intent?.talkTo || !residentById(intent.talkTo) || intent.talkTo === resident.id)
    )
      continue;
    const source = preferredMessage(game, resident.id);
    const candidates = (intentions ? [intent.talkTo] : resident.links)
      .filter((id) => !recipients.has(id))
      .map((id) => {
        const target = game.residents[id];
        const pastContact = game.messages.filter(
          (message) => message.sender === resident.id && message.receiver === id,
        ).length;
        const priority =
          (target.claim === null ? 4 : 0) +
          (source?.evidence && !target.verified ? 6 : 0) -
          pastContact * 2 +
          rng();
        return { id, priority };
      })
      .sort((a, b) => b.priority - a.priority);
    if (!candidates.length) continue;
    const receiver = candidates[0].id;
    if (!source) {
      const phrases = [
        [
          '今天过得怎么样？我刚忙完手头的事，想听听你的近况。',
          'How is your day going? I have a little time to catch up.',
        ],
        [
          '午休要不要一起喝杯咖啡？也许我们可以坐下来聊一会儿。',
          'Would you like a coffee break? We could sit and chat.',
        ],
        [
          '春天的小镇真热闹。你今天有什么打算？',
          'Town feels lively this spring. What are your plans today?',
        ],
      ];
      const [text, textEn] = phrases[(game.round + RESIDENTS.indexOf(resident)) % phrases.length];
      plans.push({
        id: `r${game.round + 1}-${resident.id}-${receiver}`,
        sender: resident.id,
        receiver,
        kind: 'chat',
        evidence: false,
        claim: null,
        text,
        textEn,
      });
      recipients.add(receiver);
      recipients.add(resident.id);
      continue;
    }
    const caution = residentById(receiver).caution;
    const claim = source.evidence
      ? 0
      : Math.min(3, Math.max(1, source.claim + (rng() > caution + 0.2 ? 1 : 0)));
    const phrases = [
      '我刚听到一个消息：',
      '在路上遇到你正好，',
      '这件事你听说了吗？',
      '刚才有人跟我聊起，',
    ];
    plans.push({
      id: `r${game.round + 1}-${resident.id}-${receiver}`,
      sender: resident.id,
      receiver,
      parentId: source.id,
      sourceClaim: source.claim,
      textEn: source.evidence
        ? `I have a first-hand source: ${scene.factEn}`
        : scene.claimsEn[claim],
      evidence: source.evidence,
      claim,
      confidence: source.evidence ? 100 : Math.min(95, 48 + claim * 12 + Math.floor(rng() * 12)),
      text: source.evidence
        ? `我有直接的消息来源：${scene.fact}`
        : `${phrases[Math.floor(rng() * phrases.length)]}${scene.claims[claim]}。`,
    });
    recipients.add(receiver);
    recipients.add(resident.id);
  }
  return plans;
}

export function advanceTurn(game, replies = [], intentions, snapshot) {
  if (isFinished(game)) return game;
  const next = structuredClone(game);
  next.round += 1;
  const plans = planTurn(game, intentions);
  const activities = planActivities(game, plans);
  next.village = finishActivities(activities);
  for (const plan of plans) {
    const reply = replies.find((item) => item.id === plan.id);
    // Only evidence-bearing messages may establish a verified belief.
    const allowedClaims = plan.kind === 'chat' ? [null] : plan.evidence ? [0] : [1, 2, 3];
    const validReply =
      reply &&
      allowedClaims.includes(reply.claim) &&
      typeof reply.text === 'string' &&
      reply.text.trim().length > 0 &&
      reply.text.length <= 240;
    const claim = validReply ? reply.claim : plan.claim;
    const message = {
      ...plan,
      id: `m${next.messages.length}`,
      round: next.round,
      kind: plan.kind === 'chat' ? 'chat' : plan.evidence ? 'correction' : 'rumor',
      claim,
      confidence: plan.evidence ? 100 : Math.min(95, 48 + claim * 13),
      text: validReply ? reply.text.trim() : plan.text,
      textEn: validReply ? reply.textEn || '' : plan.textEn,
      mode: validReply ? 'ai' : 'demo',
      ...(snapshot?.actors?.[plan.sender] && snapshot?.actors?.[plan.receiver]
        ? {
            pixelMeeting: {
              sender: { x: snapshot.actors[plan.sender].x, y: snapshot.actors[plan.sender].y },
              receiver: {
                x: snapshot.actors[plan.receiver].x,
                y: snapshot.actors[plan.receiver].y,
              },
            },
          }
        : {}),
      meeting: {
        place: activities[plan.sender].place,
        sender: activities[plan.sender].to,
        receiver: activities[plan.receiver].to,
      },
    };
    if (plan.kind === 'chat') {
      message.id = `encounter-${next.round}-${plan.sender}-${plan.receiver}`;
      next.encounters = [...(next.encounters || []), message].slice(
        game.cognitionVersion ? -864 : -216,
      );
      continue;
    }
    next.messages.push(message);
    const current = next.residents[plan.receiver];
    // A rumor never overrides official evidence, even when repeated.
    if (plan.evidence || !current.verified) {
      next.residents[plan.receiver] = {
        claim,
        confidence: message.confidence,
        messageId: message.id,
        verified: plan.evidence,
      };
    }
  }
  next.history.push({ round: next.round, ...getStats(next) });
  next.lastAction = 'turn';
  return next;
}

export function intervene(game, targetId, type = 'evidence') {
  const scene = getScenario(game);
  if (!scene.fact) return game;
  if (
    (isFinished(game) && game.playMode !== 'explore') ||
    game.remaining < 1 ||
    !residentById(targetId) ||
    !['evidence', 'broadcast'].includes(type)
  )
    return game;
  const targets =
    type === 'broadcast'
      ? [...RESIDENTS]
          .filter(({ id }) => !game.residents[id].verified)
          .sort((a, b) => b.caution - a.caution)
          .slice(0, 3)
          .map(({ id }) => id)
      : [targetId];
  const cost = type === 'broadcast' ? 2 : 1;
  if (game.remaining < cost || targets.every((id) => game.residents[id].verified)) return game;
  const next = structuredClone(game);
  next.remaining -= cost;
  for (const id of targets) {
    if (next.residents[id].verified) continue;
    const message = {
      id: `m${next.messages.length}`,
      parentId: null,
      sender: 'notice',
      receiver: id,
      round: next.round,
      claim: 0,
      confidence: 100,
      evidence: true,
      kind: type === 'broadcast' ? 'broadcast' : 'intervention',
      textEn: `[${scene.sourceEn}] ${scene.factEn}`,
      text: `【${scene.source}】${scene.fact}`,
      mode: 'demo',
    };
    next.messages.push(message);
    next.residents[id] = { claim: 0, confidence: 100, messageId: message.id, verified: true };
  }
  next.history[next.history.length - 1] = { round: next.round, ...getStats(next) };
  next.lastAction = type;
  return next;
}

export function traceMessage(game, messageId) {
  const chain = [];
  const visited = new Set();
  let message = game.messages.find((item) => item.id === messageId);
  while (message && !visited.has(message.id)) {
    visited.add(message.id);
    chain.unshift(message);
    message = game.messages.find((item) => item.id === message.parentId);
  }
  return chain;
}

export function toModelConversations(game, intentions) {
  return planTurn(game, intentions).map((plan) => ({
    id: plan.id,
    senderId: plan.sender,
    receiverId: plan.receiver,
    sourceId: plan.parentId || null,
    sender: personText(plan.sender, 'name', game.language),
    personality: personText(plan.sender, 'trait', game.language),
    receiver: personText(plan.receiver, 'name', game.language),
    kind: plan.kind || 'message',
    heard:
      plan.kind === 'chat'
        ? game.language === 'en'
          ? plan.textEn
          : plan.text
        : messageText(preferredMessage(game, plan.sender), game.language),
    evidence: plan.evidence,
    allowedClaims: plan.kind === 'chat' ? [null] : plan.evidence ? [0] : [1, 2, 3],
    claimMeanings:
      plan.kind === 'chat'
        ? []
        : (plan.evidence ? [0] : [1, 2, 3]).map((id) => ({
            id,
            text:
              game.language === 'en'
                ? getScenario(game).claimsEn[id]
                : getScenario(game).claims[id],
          })),
  }));
}

export function validateGame(value) {
  try {
    if (
      value?.apiBudget !== undefined &&
      (!value.apiBudget ||
        !Number.isInteger(value.apiBudget.limit) ||
        value.apiBudget.limit < 1 ||
        value.apiBudget.limit > 50 ||
        !Number.isInteger(value.apiBudget.used) ||
        value.apiBudget.used < 0 ||
        value.apiBudget.used > value.apiBudget.limit ||
        value.apiBudget.remaining !== value.apiBudget.limit - value.apiBudget.used)
    )
      return false;
    if (value?.cognitionVersion !== undefined && value.cognitionVersion !== 'private-life-v1')
      return false;
    const validDialogue = (message) =>
      message.dialogue === undefined ||
      Boolean(
        value.cognitionVersion === 'private-life-v1' &&
        message.dialogue &&
        typeof message.dialogue.id === 'string' &&
        /^[a-zA-Z0-9-]{1,100}$/.test(message.dialogue.id) &&
        message.dialogue.total === 4 &&
        Number.isInteger(message.dialogue.turn) &&
        message.dialogue.turn >= 0 &&
        message.dialogue.turn < 4,
      );
    if (value?.messages && value?.encounters) {
      const turns = [...value.messages, ...value.encounters]
        .filter((m) => m.dialogue)
        .map((m) => `${m.round}-${m.dialogue.id}-${m.dialogue.turn}`);
      if (new Set(turns).size !== turns.length) return false;
    }
    if (value?.scenarioId !== undefined && !SCENARIOS.some((s) => s.id === value.scenarioId))
      return false;
    if (value?.scenarioId === 'free-day' && value.messages?.length) return false;
    if (
      value?.storyProgress !== undefined &&
      (!value.storyProgress ||
        !Array.isArray(value.storyProgress.arrivals) ||
        value.storyProgress.arrivals.length > RESIDENTS.length ||
        new Set(value.storyProgress.arrivals.map((p) => p?.id)).size !==
          value.storyProgress.arrivals.length ||
        !value.storyProgress.arrivals.every(
          (p) =>
            p &&
            residentById(p.id) &&
            Number.isInteger(p.round) &&
            p.round >= 0 &&
            p.round <= value.round,
        ))
    )
      return false;
    if (
      value?.encounters !== undefined &&
      (!Array.isArray(value.encounters) ||
        value.encounters.length > (value.cognitionVersion ? 864 : 216) ||
        new Set(value.encounters.map((m) => m?.id)).size !== value.encounters.length ||
        !value.encounters.every(
          (m) =>
            m &&
            validDialogue(m) &&
            typeof m.id === 'string' &&
            m.id.length <= 100 &&
            m.kind === 'chat' &&
            m.claim === null &&
            m.evidence === false &&
            residentById(m.sender) &&
            residentById(m.receiver) &&
            m.sender !== m.receiver &&
            Number.isInteger(m.round) &&
            m.round > 0 &&
            m.round <= value.round &&
            typeof m.text === 'string' &&
            m.text.length <= 240 &&
            typeof m.textEn === 'string' &&
            m.textEn.length <= 240 &&
            ['ai', 'demo'].includes(m.mode),
        ))
    )
      return false;
    if (value?.village !== undefined && !validVillage(value.village)) return false;
    if (
      !value ||
      value.version !== 1 ||
      typeof value.id !== 'string' ||
      value.id.length > 100 ||
      !Number.isInteger(value.seed) ||
      !Number.isInteger(value.round) ||
      value.round < 0 ||
      value.round > (value.playMode === 'explore' ? 72 : SCENARIO.maxRounds) ||
      !Number.isInteger(value.remaining) ||
      value.remaining < 0 ||
      value.remaining > 3 ||
      !Array.isArray(value.messages) ||
      value.messages.length >
        (value.cognitionVersion ? 1024 : value.playMode === 'explore' ? 512 : 100) ||
      !Array.isArray(value.history) ||
      value.history.length !== value.round + 1
    )
      return false;
    if (
      Object.keys(value.residents).length !== RESIDENTS.length ||
      !value.history.every(
        (point, index) =>
          point &&
          point.round === index &&
          ['corrected', 'rumor', 'unaware'].every(
            (key) =>
              Number.isInteger(point[key]) && point[key] >= 0 && point[key] <= RESIDENTS.length,
          ) &&
          point.corrected + point.rumor + point.unaware === RESIDENTS.length,
      )
    )
      return false;
    const known = new Set();
    for (const message of value.messages) {
      if (!validDialogue(message)) return false;
      if (
        message.pixelMeeting !== undefined &&
        (!message.pixelMeeting ||
          ![message.pixelMeeting.sender, message.pixelMeeting.receiver].every(
            (p) =>
              p &&
              Number.isFinite(p.x) &&
              Number.isFinite(p.y) &&
              p.x >= 0 &&
              p.x <= 1152 &&
              p.y >= 0 &&
              p.y <= 800,
          ))
      )
        return false;
      if (
        message.meeting !== undefined &&
        (!message.meeting ||
          !PLACES[message.meeting.place] ||
          !validPosition(message.meeting.sender) ||
          !validPosition(message.meeting.receiver))
      )
        return false;
      if (
        typeof message.id !== 'string' ||
        known.has(message.id) ||
        (message.parentId !== null && !known.has(message.parentId)) ||
        !residentById(message.receiver) ||
        ![0, 1, 2, 3].includes(message.claim) ||
        typeof message.evidence !== 'boolean' ||
        message.evidence !== (message.claim === 0) ||
        typeof message.text !== 'string' ||
        message.text.length > 500 ||
        (message.textEn !== undefined &&
          (typeof message.textEn !== 'string' || message.textEn.length > 500)) ||
        !Number.isInteger(message.round) ||
        message.round < 0 ||
        message.round > value.round ||
        !['source', 'notice', ...RESIDENTS.map(({ id }) => id)].includes(message.sender)
      )
        return false;
      if (
        !Number.isFinite(message.confidence) ||
        message.confidence < 0 ||
        message.confidence > 100 ||
        !(
          ['demo', 'ai'].includes(message.mode) ||
          (value.executionMode === 'live' &&
            message.parentId === null &&
            ['scenario', 'intervention'].includes(message.mode))
        )
      )
        return false;
      if (message.parentId !== null) {
        const parent = value.messages.find((item) => item.id === message.parentId);
        if (
          parent.receiver !== message.sender ||
          parent.evidence !== message.evidence ||
          (parent.round >= message.round &&
            !(
              value.cognitionVersion === 'private-life-v1' &&
              parent.round === message.round &&
              parent.dialogue?.id === message.dialogue?.id &&
              Number.isInteger(parent.dialogue?.turn) &&
              parent.dialogue.turn < message.dialogue?.turn
            ))
        )
          return false;
      } else if (message.sender !== (message.evidence ? 'notice' : 'source')) return false;
      known.add(message.id);
    }
    return RESIDENTS.every(({ id }) => {
      const state = value.residents[id];
      if (
        !state ||
        ![null, 0, 1, 2, 3].includes(state.claim) ||
        typeof state.verified !== 'boolean' ||
        !Number.isFinite(state.confidence) ||
        state.confidence < 0 ||
        state.confidence > 100
      )
        return false;
      if (state.claim === null) return state.messageId === null && !state.verified;
      const message = value.messages.find((item) => item.id === state.messageId);
      return (
        message?.receiver === id &&
        message.claim === state.claim &&
        message.evidence === state.verified
      );
    });
  } catch {
    return false;
  }
}
