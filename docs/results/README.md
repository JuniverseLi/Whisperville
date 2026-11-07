# Measured artifacts / 实验数据

All files below are from completed local executions, except the explicitly labeled failed pilot. No new provider calls are made when reading or replaying them. File SHA-256 hashes are listed in [manifest.json](manifest.json).

## Current live-town run · 2026-11-07

[live-town-run-v1.json](live-town-run-v1.json) contains the actual school-rumor town run: seed 42, three committed segments, one private planning call and two four-turn meetings, nine real requests, eight utterances. [live-town-summary.json](live-town-summary.json) records 29,399 provider-reported tokens, a 58.377-second record span and zero rule substitution. All three segment audits replay offline:

```sh
npm run replay:town -- docs/results/live-town-run-v1.json
python scripts/plot-live-town.py docs/results/live-town-summary.json
```

The observed transmissions are Lin → Mia → Lin. Reach grows from two initial holders to three; the reliable notice remains with one holder and no correction occurs. Only two of the 25 residents receive model decisions; 23 remain pending. No schedule revision or reflection was returned. This single bounded trace has no control condition or general statistical conclusion. Provider response IDs are omitted from the public copy; exact prompt bodies, response text, parsed actions and their hashes remain. Credentials and authorization headers are never stored.

## Earlier artifacts

The historical rule baseline remains a separate, model-free comparison. It used 30 paired seeds (1000–1029), twelve segments and one extra notice after segment two. These values describe only that abstract rule protocol:

| Policy / 策略                        | Final source coverage | 95% bootstrap interval | Coverage AUC |
| ------------------------------------ | --------------------: | ---------------------: | -----------: |
| None / 不额外介入                    |                 56.0% |            50.0%–62.4% |        32.4% |
| Random / 随机                        |                 68.4% |            63.2%–73.2% |        39.3% |
| Highest out-degree / 最高出度        |                 71.9% |            67.1%–76.4% |        40.6% |
| Highest betweenness / 最高中介中心性 |                 72.9% |            68.3%–77.1% |        41.4% |

The paired bridge-minus-random AUC difference was +2.09 percentage points (95% interval +0.23 to +4.07). This is an outcome of the historical rule setup, not the current real town or an independently isolated centrality effect.

| Artifact                                               | Contents                                                                                                                                                                                      |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [rules-summary.json](rules-summary.json)               | Fixed 25-resident graph, 30 paired seeds (1000–1029), four policies, 12 segments, intervention after segment 2. Means, bootstrap intervals and paired differences.                            |
| [rules-trials.json.gz](rules-trials.json.gz)           | All 120 rule trials with segment histories, targets and message provenance, compressed JSON. No LLM calls.                                                                                    |
| [live-pilot-summary.json](live-pilot-summary.json)     | One paired task seed, four residents, two rounds; 16 successful actual API calls.                                                                                                             |
| [live-pilot-v2.json](live-pilot-v2.json)               | Exact task prompts, raw model text, parsed actions, usage, hashes and scores for the completed pilot. Request model name and gateway-reported model: `gemini-3.8-flash`.                      |
| [live-pilot-v1-failed.json](live-pilot-v1-failed.json) | Earlier calibration attempt: four valid responses, then incomplete JSON on the fifth request with a 256-output-token cap. Stopped without rule substitution; not counted in v2 task outcomes. |

The completed pilot raised the per-call cap to 1024 tokens and changed the protocol version to `private-number-pilot-v2`. Its provider-reported total is **17,480 tokens** over **67.092 seconds**. Earlier calibration usage is preserved separately; the total above refers only to the complete run, not lifetime billing. Gateway identity is not independent verification of underlying model weights.

## Read and verify offline

```sh
npm run replay:model -- docs/results/live-pilot-v2.json
node --input-type=module -e "import {readFileSync} from 'node:fs'; import {gunzipSync} from 'node:zlib'; const r=JSON.parse(gunzipSync(readFileSync('docs/results/rules-trials.json.gz'))); console.log(r.trials.length);"
```

Rule runs can be regenerated with `npm run experiment`; see [research protocol](../research.md). Full model reruns are stochastic, opt-in and may incur provider costs. Replaying the recorded responses verifies trace consistency; it does not re-query or independently authenticate the provider.

Exports omit API keys, authorization headers, provider response IDs and local job IDs. Ordinary model answer text is retained, not hidden reasoning. The prompts contain only fictional task data. No real resident, human-subject study or private user content is represented.

## How to interpret

- Rule experiment: paired simulator outcomes under one fixed network, not evidence of learned LLM cooperation.
- Live pilot: one task instance per condition. Four resident outcomes are not four independent task replications. No confidence intervals or significance claim are made for this pilot.
- The no-communication control lacks the other private numbers; this is primarily a protocol/information-transfer check, not an equally solvable general capability benchmark.
- Source protection and allowable claim categories are engineered constraints. They are not emergent findings about persuasion, truth, credibility or human communication.
