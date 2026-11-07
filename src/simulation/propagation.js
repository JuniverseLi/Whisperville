import { RESIDENTS } from './scenario.js';

export const emptyBelief = () => ({ claim: null, verified: false, messageId: null });

// Replay committed records in their stored order, including interventions within a segment.
export function propagationSnapshot(game, round = game.round) {
  const cutoff = Math.max(
    0,
    Math.min(game.round, Number.isFinite(round) ? Math.floor(round) : game.round),
  );
  const beliefs = Object.fromEntries(RESIDENTS.map((p) => [p.id, emptyBelief()]));
  const byId = new Map(),
    events = [];
  for (const message of game.messages) {
    if (message.round > cutoff) continue;
    const parent = byId.get(message.parentId),
      before = { ...beliefs[message.receiver] };
    const after =
      message.evidence || !before.verified
        ? { claim: message.claim, verified: message.evidence, messageId: message.id }
        : before;
    const changed = before.claim !== after.claim || before.verified !== after.verified;
    const type = !message.parentId
      ? message.kind === 'intervention' || message.kind === 'broadcast'
        ? 'intervention'
        : 'origin'
      : message.evidence && before.claim !== null && !before.verified
        ? 'correction'
        : parent && parent.message.claim !== message.claim
          ? 'mutation'
          : 'retelling';
    const event = {
      message,
      before,
      after: { ...after },
      changed,
      type,
      rootId: parent?.rootId || message.id,
      depth: parent ? parent.depth + 1 : 0,
      blockedByEvidence: !message.evidence && before.verified,
      categoryChanged: Boolean(
        parent && !message.evidence && parent.message.claim !== message.claim,
      ),
    };
    beliefs[message.receiver] = after;
    byId.set(message.id, event);
    events.push(event);
  }
  const forwarded = events.filter((e) => e.message.parentId),
    states = Object.values(beliefs);
  return {
    round: cutoff,
    beliefs,
    events,
    roots: events.filter((e) => !e.message.parentId),
    metrics: {
      reached: states.filter((s) => s.claim !== null).length,
      reliable: states.filter((s) => s.verified).length,
      rumor: states.filter((s) => s.claim !== null && !s.verified).length,
      unaware: states.filter((s) => s.claim === null).length,
      retellings: forwarded.length,
      categoryChanges: events.filter((e) => e.categoryChanged).length,
      corrected: events.filter((e) => e.type === 'correction').length,
      maxDepth: Math.max(0, ...events.map((e) => e.depth)),
    },
  };
}

// Exact parentId edges only. A social link never becomes an observed transmission.
export function cascadeLayout(snapshot, rootId = null) {
  const events = snapshot.events.filter((e) => !rootId || e.rootId === rootId);
  const children = new Map();
  for (const e of events) {
    if (!children.has(e.message.parentId)) children.set(e.message.parentId, []);
    children.get(e.message.parentId).push(e);
  }
  const rows = new Map();
  let leaf = 0;
  const visit = (e) => {
    const next = children.get(e.message.id) || [];
    const y = next.length
      ? next.map(visit).reduce((a, b) => a + b, 0) / next.length
      : leaf++ * 108 + 72;
    rows.set(e.message.id, y);
    return y;
  };
  for (const e of events.filter((e) => !e.message.parentId)) {
    visit(e);
    leaf += 0.5;
  }
  const nodes = events.map((e) => ({
    ...e,
    x: 28 + e.depth * 240,
    y: rows.get(e.message.id) || 72,
  }));
  const known = new Set(nodes.map((n) => n.message.id));
  return {
    nodes,
    edges: nodes
      .filter((n) => n.message.parentId && known.has(n.message.parentId))
      .map((n) => ({ from: n.message.parentId, to: n.message.id })),
    width: Math.max(650, 258 + Math.max(0, ...events.map((e) => e.depth)) * 240),
    height: Math.max(330, leaf * 108 + 36),
  };
}

export function eventChain(snapshot, messageId) {
  const byId = new Map(snapshot.events.map((e) => [e.message.id, e]));
  const result = [],
    visited = new Set();
  let current = byId.get(messageId);
  while (current && !visited.has(current.message.id)) {
    result.unshift(current);
    visited.add(current.message.id);
    current = byId.get(current.message.parentId);
  }
  return result;
}

export function propagationCsv(game) {
  const quote = (value) => {
    const raw = String(value ?? '');
    const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const header = [
    'message_id',
    'round',
    'sender',
    'receiver',
    'parent_id',
    'root_id',
    'depth',
    'event_type',
    'claim',
    'verified_source',
    'before_claim',
    'after_claim',
    'belief_changed',
    'blocked_by_evidence',
    'mode',
    'text',
  ];
  return [
    header.join(','),
    ...propagationSnapshot(game).events.map((e) =>
      [
        e.message.id,
        e.message.round,
        e.message.sender,
        e.message.receiver,
        e.message.parentId,
        e.rootId,
        e.depth,
        e.type,
        e.message.claim,
        e.message.evidence,
        e.before.claim,
        e.after.claim,
        e.changed,
        e.blockedByEvidence,
        e.message.mode,
        e.message.text,
      ]
        .map(quote)
        .join(','),
    ),
  ].join('\n');
}
