import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export function publicSettings(config) {
  return {
    baseUrl: config.baseUrl || '',
    model: config.model || '',
    maxCalls: config.maxCalls,
    hasApiKey: Boolean(config.apiKey),
    enabled: config.enabled,
  };
}
export function validateSettings(body, previous) {
  if (
    !body ||
    typeof body.baseUrl !== 'string' ||
    typeof body.model !== 'string' ||
    body.model.trim().length < 1 ||
    body.model.length > 120 ||
    typeof body.apiKey !== 'string' ||
    body.apiKey.length > 2000 ||
    !Number.isInteger(body.maxCalls) ||
    body.maxCalls < 1 ||
    body.maxCalls > 50
  )
    throw new Error('invalid-settings');
  const baseUrl = body.baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '');
  const url = new URL(baseUrl);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    baseUrl.length > 500
  )
    throw new Error('invalid-settings');
  const apiKey = body.apiKey.trim() || (previous.baseUrl === baseUrl ? previous.apiKey : '');
  if (!apiKey || /[\r\n]/.test(apiKey) || /[\r\n]/.test(body.model))
    throw new Error('invalid-settings');
  return { baseUrl, model: body.model.trim(), apiKey, maxCalls: body.maxCalls, enabled: true };
}
export function createSettingsStore(path) {
  return {
    read(fallback) {
      try {
        return validateSettings(JSON.parse(readFileSync(path, 'utf8')), fallback);
      } catch {
        return fallback;
      }
    },
    async write(config) {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        `${path}.tmp`,
        JSON.stringify({
          baseUrl: config.baseUrl,
          model: config.model,
          apiKey: config.apiKey,
          maxCalls: config.maxCalls,
        }),
        { mode: 0o600 },
      );
      await rename(`${path}.tmp`, path);
    },
  };
}
export async function testModelConnection(config) {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({
      model: config.model,
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    }),
  });
  if (!response.ok) throw new Error('connection-failed');
  const content = (await response.json()).choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('connection-failed');
  return true;
}
