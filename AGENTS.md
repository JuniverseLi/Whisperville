# Repository Guidelines

## Project Structure & Module Organization

Whisperville is a local pixel-town observation simulation about residents' daily lives and rumor propagation. Twenty-five residents choose activities, walk to meet, and retain messages. Four preset scenarios support up to 72 segments, with optional interventions.

- `src/game/`: tile map, collision, pathfinding, Canvas rendering, and shared observer/legacy RPG runtime.
- `src/simulation/`: scenario data, seeded turn planning, belief updates, save validation, and provenance.
- `src/agents/`: browser clients for the local model API.
- `src/ui/`: `TownObserver.jsx` controls observation; `PropagationView.jsx` shows committed cascades, historical belief changes and event export. Earlier RPG/Three.js interfaces are inactive.
- `server/`: Node.js HTTP server, model adapters, request budgets, and persistent live observation audits.
- `tests/`: Node.js unit and HTTP integration tests. `scripts/` runs offline experiments and plots exported reports.
- `public/pixel/characters/`: original four-direction sprite sheets; `public/characters/` retains earlier art. `docs/` records prompts and screenshots.
- `public/pixel/environment/`: generated building and prop atlases; align cell order with `src/game/environment.js` and preserve generation records.

Keep simulation rules independent of rendering and providers. Keep documentation artifacts in `docs/results/` credential-free and hash-checked; do not edit their recorded prompts or responses. Research reports must identify rules versus model behavior, preserve paired seeds and raw traces, and update `EXPERIMENT_VERSION` when protocols change. Distinguish scenario facts, received messages, and character beliefs. Retellings must preserve their parent message; official evidence starts a new source chain.
Keep visible furniture footprints aligned with tile collision. Verify roof reveal, depth ordering and exterior/cutaway views when changing environment art.

## Build, Test, and Development Commands

Use Node.js 22.12+ and npm.

- `npm install`: install dependencies; use `npm ci` for clean, locked installations.
- `npm run dev`: start the local API and Vite at `http://localhost:5173`.
- `npm test`: run all tests without model credentials.
- `npm run experiment`: run paired rule-based experiments; generated data stays in `output/`.
- `npm run build`: build the client into `dist/`.
- `npm start`: serve the built client and API.
- `npm run format` / `npm run format:check`: apply or check Prettier formatting.

Frontend edits hot-reload. Restart development after backend or `.env` changes.

## Coding Style & Naming Conventions

Use JavaScript ES modules, two-space indentation, single quotes, and Prettier. Components use PascalCase names; functions use camelCase. Scenario identifiers use kebab-case, such as `school-closure`. Prefer pure state transitions and small components. Keep player-facing text bilingual in Chinese and English using `Language.jsx` and `src/i18n.js`; explain behavior changes in the README.

## Testing Guidelines

Use `node:test` and `node:assert/strict`; name tests `tests/*.test.mjs`. Cover map connectivity, collision, intention validation, source provenance, corrupted saves, and HTTP failures. Use seeded inputs and mocked model responses. No coverage threshold is established. Paid checks must be opt-in. Live model studies require independent private prompts, request auditing and explicit failure states; never replace missing model responses with rule answers. Run tests and build before submitting. Verify pause, speed, one-segment stepping, actual meetings, model-driven contact changes, memory inspection, cited reflections, ordinary chats, drag/tap separation, wheel and touch controls, onboarding, scene switching, actual arrivals, language persistence and API settings for behavior changes.

## Commit & Pull Request Guidelines

No Git history existed at project creation. Adopt Conventional Commits, for example `feat(simulation): add a scenario`. PRs should describe behavior changes, link issues, report validation, and include screenshots for UI changes.

## Security & Configuration

Copy `.env.example` to `.env` for optional model credentials. UI settings persist in `.whisperville/api.json` and override environment configuration. Never commit keys or expose them through `VITE_` variables. Preserve same-origin checks, request bounds, model budgets, and audit storage. The live town requires real API responses: pause on missing configuration, invalid output or exhausted quota; never substitute rule dialogue. Keep historical rule experiments separate. Treat model text and browser saves as untrusted. The server is a loopback-only prototype; public hosting requires authentication and durable quotas.
