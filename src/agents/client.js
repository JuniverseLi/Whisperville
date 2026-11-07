import { toModelConversations } from '../simulation/engine.js';

export async function getModelStatus(signal) {
  const response = await fetch('/api/status', { signal });
  if (!response.ok) throw new Error('无法连接本地服务');
  return response.json();
}

export async function requestDialogue(game, signal, residents, snapshot) {
  const { minds, ...state } = game;
  const response = await fetch('/api/turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId: game.id,
      round: game.round,
      language: game.language || 'zh',
      conversations: toModelConversations(game, residents ? game.intentions : undefined),
      ...(residents ? { residents } : {}),
      ...(game.executionMode === 'live'
        ? { executionMode: 'live', attemptId: crypto.randomUUID(), state, snapshot }
        : {}),
    }),
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || '模型暂时无法回应');
    error.budget = data.budget;
    error.auditId = data.auditId;
    throw error;
  }
  return data;
}
