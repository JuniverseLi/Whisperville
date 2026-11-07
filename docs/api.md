# Local model API

The local Node server exposes a same-origin API. It supports Chat Completions compatible cloud providers and local servers. Use **Settings → Test connection → Save configuration**; changes apply to the next segment without restarting.

## Configuration

| Endpoint                | Contract                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `GET /api/status`       | Returns `mode`, `model` and `maxCalls`.                                                |
| `GET /api/config`       | Returns `baseUrl`, `model`, `maxCalls`, `enabled`, `hasApiKey`; never returns the key. |
| `POST /api/config`      | Accepts `{baseUrl, model, apiKey, maxCalls}` and persists settings.                    |
| `POST /api/config/test` | Accepts the same fields and makes one small provider request. Does not save.           |

Use `Content-Type: application/json`. `baseUrl` is an HTTP(S) endpoint such as `http://localhost:11434/v1`; a trailing `/chat/completions` is normalized. A blank key retains the existing key only when the endpoint stays the same. For a keyless local provider, enter `local`. The UI accepts a per-game limit of 1–50 actual provider attempts. A four-turn conversation requires four available calls; a quiet personal planning step requires one. No configured limit is automatically increased.

Saved configuration lives in `.whisperville/api.json`, overrides environment variables and stays outside the frontend and exported runs. Errors return a sanitized `code`, such as `invalid-settings`, `connection-failed` or `budget-exceeded`.

## Observation

`POST /api/turn` accepts `{gameId, round, language, residents, conversations}`. `language` is `zh` or `en`. `round` is 0–71 for observation. The local server receives 25 bounded profiles containing goals, locations, schedules, retrieved memories, reflections, visible observations and personally received sources. Meeting inputs include `id`, `senderId`, `receiverId`, `sourceId` and allowed claim categories. The transport accepts up to three meetings; `private-life-v1` settles at most one per segment after residents physically meet.

The server orchestrates separate calls to `${baseUrl}/chat/completions`. Each remote request contains exactly one resident's personal context and only the dialogue already delivered within that meeting. The public directory contains names and IDs, not other profiles. Each remote response must include:

- `text`, `textEn`, `claim` and `sourceId`: bilingual speech; questions and ordinary responses use null claim/source. A retelling cites an existing personal source or an earlier message received in this conversation; evidence is derived from that source.
- `intention`: only this resident's next activity, with `id`, legal `place`, bilingual `activity`/`reason`, and a public contact ID or null `talkTo`.
- Optional `scheduleChange`: future `time`, legal `place`, `kind`, 10–120 minute `duration`, bilingual reasons and `evidenceIds` citing personal experiences or delivered utterances.
- Optional `reflection`: bilingual inference and personal evidence citations; it does not create verified facts.

Successful local responses contain `mode`, `cognitionVersion`, four-turn `sessions`, merged `intentions`, `decidedIds`, optional `reflections` and `scheduleChanges`, and `budget: {used, limit, remaining}`. Only residents listed in `decidedIds` receive model intention updates. Quiet periods rotate one individual planning call without inventing a conversation.

See `server/cognition.mjs`, `src/simulation/life.js`, `cognition.js` and `day-plan.js` for validation. Budget capacity is reserved before the exchange; failed attempts still count. Incomplete dialogue is not submitted as a completed model conversation. The daily UI pauses on any incomplete or invalid model result; it never substitutes rule answers. Client disconnection aborts the current provider request and prevents later turns.

## Audited live observation

Live requests additionally include `executionMode: live`, a unique UUID `attemptId`, the pre-turn `state` without long-term minds, and the actual actor `snapshot`. Initial scene messages use `mode: scenario`; only received model decisions use `ai`. The live body limit is 512 KiB, while the legacy observation limit remains 256 KiB.

Inputs are persisted before sending. Completed segments return `auditId` and `replayVerified`; failures return an explicit HTTP error with usage and any audit ID, without committing a turn. A failed round may be retried manually using a new attempt ID; a completed round cannot be purchased again. Durable records restore per-game usage and completed rounds after server restart.

- `GET /api/observations/latest`: latest local audit, without calling the provider.
- `GET /api/observations/:id`: raw request/response records and the deterministic outcome.
- `POST /api/observations/:id/replay`: rebuild requests, validate raw responses and check state transitions with zero provider calls.

Audit files stay under `.whisperville/observations/`; do not upload the settings directory with them. The UI exports all audit files for the current run, separately from the independent private-number pilot.

## 中文接入说明

在齿轮设置中填写接口地址、模型名与密钥，先测试，再保存。模型必须返回中英双语字段。本机服务按居民拆分请求，每次只向模型提供一位居民的个人上下文和本次已经收到的对话；四句交流计四次请求，安静时段的个人规划计一次，失败也占额度；失败或额度不足时暂停，不自动补答。接口目前仅面向本机单用户；密钥文件不要上传到 Git 或随观察记录分享。

## Live model pilot

- `GET /api/model-studies/status`: configured model, process request balance and active study ID. No key is returned.
- `POST /api/model-studies`: explicit paid-run opt-in. JSON fields: a UUID `clientId`, integer `seedStart` (0–2147483640), `seeds` (1–3), and `language` (`en`/`zh`). Returns HTTP 202 with the job ID. Same-client retries return the same job rather than creating duplicate requests.
- `GET /api/model-studies/:id`: raw report and current progress.
- `POST /api/model-studies/:id/cancel`: aborts in-flight work and stops future calls; a sent request may already be billed.
- `POST /api/model-studies/:id/replay`: validates the stored successful trace with no provider calls.

The pilot uses four isolated residents, two synchronous rounds and communication enabled/disabled on identical private-number tasks. Each seed reserves an upper bound of 16 requests. One pilot runs at a time; requests share the service-wide 120-call limit and two-call concurrency cap. Every request is audited before sending. Failed or cancelled jobs retain partial records and cannot be passed off as complete replays. Persisted jobs are not automatically resumed after a restart. Store paths stay under `.whisperville/model-studies/`.
