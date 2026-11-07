import { createExploreGame } from '../game/session.js';
import { RESIDENTS } from './scenario.js';
import { COGNITION_VERSION, applyDayPlans } from './day-plan.js';
import { advanceCognitiveTurn, resolveCognitiveEvidence } from './cognition.js';
import { seedMinds, updateMinds, validReflections } from './memory.js';
import { validIntentions, recordStoryProgress } from './life.js';

export const LIVE_VERSION = 'live-town-v1';
export function createLiveGame(seed = 42, scenarioId = 'spring-party') {
  const game = createExploreGame(seed, scenarioId);
  game.observer = true;
  game.executionMode = 'live';
  game.cognitionVersion = COGNITION_VERSION;
  game.liveVersion = LIVE_VERSION;
  game.minds = seedMinds(game);
  game.lifeMode = 'pending';
  for (const message of game.messages) message.mode = 'scenario';
  game.intentions = RESIDENTS.map((person) => ({
    id: person.id,
    place: person.home,
    activity: '等待自己的模型规划',
    activityEn: 'Awaiting a personal model decision',
    reason: '尚未收到这位居民的真实模型决策。',
    reasonEn: 'No real model decision has been received for this resident.',
    talkTo: null,
    mode: 'pending',
  }));
  return game;
}

export function commitLiveTurn(base, result, snapshot) {
  if (
    result?.mode !== 'ai' ||
    !result.auditId ||
    !Array.isArray(result.sessions) ||
    !result.sessions.every((session) => session.turns.every((turn) => turn.mode === 'ai')) ||
    !validIntentions(result.intentions) ||
    !Array.isArray(result.decidedIds)
  )
    throw new Error('A complete audited model result is required');
  const next = advanceCognitiveTurn(base, result.sessions, snapshot);
  next.apiBudget = result.budget;
  next.auditIds = [...(base.auditIds || []), result.auditId].slice(-100);
  next.executionMode = 'live';
  next.liveVersion = LIVE_VERSION;
  next.storyProgress = recordStoryProgress(next, snapshot);
  next.minds = updateMinds(base, next, snapshot);
  const reflections = (result.reflections || []).map((reflection) => ({
    ...reflection,
    evidenceIds: resolveCognitiveEvidence(next, reflection.id, reflection.evidenceIds),
  }));
  if (
    !validReflections(
      reflections,
      RESIDENTS.map((person) => ({ id: person.id, memoryRecords: next.minds[person.id].memories })),
    )
  )
    throw new Error('Invalid personal reflection');
  next.minds = updateMinds(next, next, undefined, reflections);
  applyDayPlans(
    next,
    (result.scheduleChanges || []).map((change) => ({
      ...change,
      mode: 'ai',
      evidenceIds: resolveCognitiveEvidence(next, change.id, change.evidenceIds),
    })),
    snapshot,
  );
  next.intentions = base.intentions.map((intention) =>
    result.decidedIds.includes(intention.id)
      ? { ...result.intentions.find((item) => item.id === intention.id), mode: 'ai' }
      : intention,
  );
  next.lifeMode = 'ai';
  return next;
}
