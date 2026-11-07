import { RESIDENTS } from './scenario.js';
import { advanceTurn, getStats, planTurn } from './engine.js';
import { demoIntentions } from './life.js';
import { perceiveTown } from './perception.js';
import { getScenario } from './scenarios.js';
import { COGNITION_VERSION, DIALOGUE_TURNS, timeAtRound } from './day-plan.js';

export function cognitiveDemoIntentions(game, snapshot) {
  return demoIntentions(game).map((intent, index) => {
    const person = RESIDENTS.find((p) => p.id === intent.id);
    const mind = game.minds?.[intent.id];
    const lastChange = mind?.planChanges?.at(-1);
    const active = mind?.schedule?.findLast(
      (slot) =>
        slot.replanned &&
        slot.time <= timeAtRound(game.round) &&
        !['completed', 'missed'].includes(slot.status),
    );
    const ownSource = game.messages.find(
      (message) => message.id === game.residents[intent.id].messageId,
    );
    const seen = perceiveTown(game, snapshot, person.id).map(
      (observation) => observation.subjectId,
    );
    const contacts = [...person.links].sort(
      (a, b) => Number(seen.includes(b)) - Number(seen.includes(a)),
    );
    const contacted = new Set(
      game.messages.filter((m) => m.sender === person.id).map((m) => m.receiver),
    );
    // Choose from personal contact history, never a neighbor's hidden belief state.
    const talkTo =
      (index + game.round) % 4 === 1 || (ownSource && index === game.round % RESIDENTS.length)
        ? contacts.find((id) => !contacted.has(id)) || contacts[game.round % contacts.length]
        : null;
    return {
      ...intent,
      ...(active
        ? {
            place: active.place,
            activity: '按调整后的日程行动',
            activityEn: 'Follow my revised schedule',
            reason: lastChange?.reason || intent.reason,
            reasonEn: lastChange?.reasonEn || intent.reasonEn,
          }
        : {}),
      ...(ownSource && !active
        ? {
            reason: `根据自己收到的消息：${ownSource.text}`.slice(0, 200),
            reasonEn: `Based on a message I received: ${ownSource.textEn || ''}`.slice(0, 240),
          }
        : {}),
      talkTo,
    };
  });
}

export function resolveCognitiveEvidence(game, id, references) {
  return references.map((reference) => {
    const record = [...game.messages, ...(game.encounters || [])].find(
      (message) =>
        message.dialogue &&
        `${message.dialogue.id}:${message.dialogue.turn}` === reference &&
        [message.sender, message.receiver].includes(id),
    );
    return record ? (record.kind === 'chat' ? record.id : `msg-${record.id}-${id}`) : reference;
  });
}

export function demoDayChanges(before, next) {
  const scene = getScenario(next);
  return RESIDENTS.flatMap((person) => {
    const received = next.messages
      .slice(before.messages.length)
      .find((message) => message.receiver === person.id);
    if (!received) return [];
    const place = scene.place && received.evidence ? scene.place : person.home;
    return [
      {
        id: person.id,
        time: timeAtRound(next.round + 1),
        place,
        kind: scene.place && received.evidence ? 'social' : 'work',
        duration: 30,
        reason: `刚收到${received.evidence ? '有来源的消息' : '尚未核实的消息'}，调整接下来的安排。`,
        reasonEn: `I just received ${received.evidence ? 'a source-backed message' : 'an unverified message'} and revised my next activity.`,
        evidenceIds: [`msg-${received.id}-${person.id}`],
        mode: 'demo',
      },
    ];
  });
}

export function demoDialogues(game) {
  return planTurn(game, game.intentions).map((plan) => {
    const initial = {
      id: `${plan.id}:0`,
      speaker: plan.sender,
      receiver: plan.receiver,
      text: plan.text,
      textEn: plan.textEn,
      claim: plan.kind === 'chat' ? null : plan.claim,
      sourceId: plan.parentId || null,
      evidence: Boolean(plan.evidence),
      mode: 'demo',
    };
    return {
      id: plan.id,
      turns: [
        initial,
        {
          id: `${plan.id}:1`,
          speaker: plan.receiver,
          receiver: plan.sender,
          text:
            plan.kind === 'chat'
              ? '有空聊聊挺好的。你接下来有什么安排？'
              : '这条消息是从哪里听来的？我想先确认一下。',
          textEn:
            plan.kind === 'chat'
              ? 'It is good to catch up. What are your plans?'
              : 'Where did you hear that? I would like to check.',
          claim: null,
          sourceId: null,
          evidence: false,
          mode: 'demo',
        },
        {
          ...initial,
          id: `${plan.id}:2`,
          sourceId: plan.parentId || null,
          text:
            plan.kind === 'chat' ? '我会先把自己的事忙完，再看看邻居有没有需要帮忙的。' : plan.text,
          textEn:
            plan.kind === 'chat'
              ? 'I will finish my own tasks, then see if a neighbor needs help.'
              : plan.textEn,
        },
        {
          id: `${plan.id}:3`,
          speaker: plan.receiver,
          receiver: plan.sender,
          text:
            plan.kind === 'chat' ? '好，那我们晚点再聊。' : '我记下你说的话了，也会留意后续消息。',
          textEn:
            plan.kind === 'chat'
              ? 'All right, let us catch up later.'
              : 'I have noted what you said and will watch for updates.',
          claim: null,
          sourceId: null,
          evidence: false,
          mode: 'demo',
        },
      ],
    };
  });
}

export function advanceCognitiveTurn(game, sessions, snapshot) {
  const plans = planTurn(game, game.intentions);
  const firstReplies = plans.map((plan) => {
    const turn = sessions.find((session) => session.id === plan.id)?.turns[0];
    if (!turn) throw new Error('Missing conversation');
    if (
      turn.speaker !== plan.sender ||
      turn.receiver !== plan.receiver ||
      turn.sourceId !== (plan.parentId || null) ||
      (plan.kind === 'chat'
        ? turn.claim !== null
        : plan.evidence
          ? turn.claim !== 0
          : ![1, 2, 3].includes(turn.claim))
    )
      throw new Error('Invalid initial source');
    return { id: plan.id, claim: turn.claim, text: turn.text, textEn: turn.textEn };
  });
  const next = advanceTurn(game, firstReplies, game.intentions, snapshot);
  next.cognitionVersion = COGNITION_VERSION;
  for (const plan of plans) {
    const session = sessions.find((item) => item.id === plan.id);
    if (!session || session.turns.length !== DIALOGUE_TURNS)
      throw new Error('Incomplete conversation');
    if (
      !session.turns.every(
        (turn) =>
          ['ai', 'demo'].includes(turn.mode) &&
          ['text', 'textEn'].every(
            (key) =>
              typeof turn[key] === 'string' &&
              turn[key].trim().length > 0 &&
              turn[key].length <= 240,
          ),
      )
    )
      throw new Error('Invalid dialogue text');
    const first = [...next.messages, ...(next.encounters || [])].find(
      (message) =>
        message.round === next.round &&
        message.sender === plan.sender &&
        message.receiver === plan.receiver,
    );
    const references = new Map([[session.turns[0].id, first.id]]);
    first.mode = session.turns[0].mode;
    first.dialogue = { id: session.id, turn: 0, total: DIALOGUE_TURNS };
    for (const [index, turn] of session.turns.entries()) {
      if (!index) continue;
      const speaker = index % 2 ? plan.receiver : plan.sender;
      const receiver = index % 2 ? plan.sender : plan.receiver;
      if (turn.speaker !== speaker || turn.receiver !== receiver)
        throw new Error('Invalid speaker order');
      const sourceId = references.get(turn.sourceId) || turn.sourceId;
      const source =
        sourceId &&
        next.messages.find((message) => message.id === sourceId && message.receiver === speaker);
      if (
        turn.claim !== null &&
        (!source ||
          source.evidence !== turn.evidence ||
          (source.evidence ? turn.claim !== 0 : ![1, 2, 3].includes(turn.claim)))
      )
        throw new Error('Invalid dialogue source');
      const message = {
        id:
          turn.claim === null
            ? `encounter-${next.round}-${speaker}-${receiver}-${index}`
            : `m${next.messages.length}`,
        parentId: source?.id || null,
        sender: speaker,
        receiver,
        round: next.round,
        claim: turn.claim,
        evidence: Boolean(source?.evidence),
        confidence: source?.evidence ? 100 : 48 + (turn.claim || 0) * 13,
        kind: turn.claim === null ? 'chat' : source.evidence ? 'correction' : 'rumor',
        text: turn.text,
        textEn: turn.textEn,
        mode: turn.mode,
        dialogue: { id: session.id, turn: index, total: DIALOGUE_TURNS },
        ...(first.pixelMeeting
          ? {
              pixelMeeting:
                index % 2
                  ? { sender: first.pixelMeeting.receiver, receiver: first.pixelMeeting.sender }
                  : first.pixelMeeting,
            }
          : {}),
      };
      references.set(turn.id, message.id);
      if (turn.claim === null) next.encounters = [...(next.encounters || []), message].slice(-864);
      else {
        next.messages.push(message);
        if (source.evidence || !next.residents[receiver].verified)
          next.residents[receiver] = {
            claim: message.claim,
            confidence: message.confidence,
            messageId: message.id,
            verified: message.evidence,
          };
      }
    }
  }
  next.history[next.round] = { round: next.round, ...getStats(next) };
  return next;
}
