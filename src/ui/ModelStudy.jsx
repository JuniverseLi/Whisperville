import './experiment.css';
import { useEffect, useRef, useState } from 'react';
import Dialog from './Dialog.jsx';
import { useLanguage } from './Language.jsx';
import {
  callsForStudy,
  MODEL_STUDY_VERSION,
  STUDY_OUTPUT_TOKENS,
} from '../simulation/model-study.js';

export default function ModelStudy({ onClose, onRules }) {
  const { t } = useLanguage();
  const [status, setStatus] = useState(null),
    [seeds, setSeeds] = useState(1),
    [seedStart, setSeedStart] = useState(1000),
    [report, setReport] = useState(null),
    [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [replayed, setReplayed] = useState(false);
  const active = useRef(null),
    mounted = useRef(true);
  const needsRestart = status && status.version !== MODEL_STUDY_VERSION;
  const tokenCap = status?.outputTokenCap || STUDY_OUTPUT_TOKENS;
  const running = ['queued', 'running'].includes(report?.status),
    planned = callsForStudy(seeds);
  useEffect(() => {
    mounted.current = true;
    fetch('/api/model-studies/status')
      .then((r) => r.json())
      .then(async (data) => {
        if (!mounted.current) return;
        setStatus(data);
        let id = data.activeStudyId || data.latestStudyId;
        try {
          id = id || localStorage.getItem('whisperville.model-study.id');
        } catch {
          /* Optional preference. */
        }
        if (id) {
          const response = await fetch(`/api/model-studies/${id}`);
          if (response.ok && mounted.current) {
            const stored = await response.json();
            if (!mounted.current) return;
            setReport(stored);
            if (['queued', 'running'].includes(stored.status)) active.current = id;
          }
        }
      })
      .catch(() => {
        if (mounted.current) setError('unavailable');
      });
    return () => {
      mounted.current = false;
      if (active.current)
        fetch(`/api/model-studies/${active.current}/cancel`, {
          method: 'POST',
          keepalive: true,
        }).catch(() => {});
    };
  }, []);
  useEffect(() => {
    if (!report?.id || !running) return;
    let stopped = false;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch(`/api/model-studies/${report.id}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error();
        const next = await response.json();
        if (stopped) return;
        setReport(next);
        if (!['queued', 'running'].includes(next.status)) active.current = null;
      } catch (e) {
        if (e.name !== 'AbortError') setError('poll-failed');
      }
    };
    const timer = setInterval(poll, 1200);
    poll();
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [report?.id, running]);
  async function start() {
    setPending(true);
    setError('');
    setReplayed(false);
    try {
      const response = await fetch('/api/model-studies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: crypto.randomUUID(), seedStart, seeds, language: 'en' }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.code || 'unavailable');
        return;
      }
      if (!mounted.current) {
        fetch(`/api/model-studies/${data.id}/cancel`, { method: 'POST', keepalive: true }).catch(
          () => {},
        );
        return;
      }
      active.current = data.id;
      try {
        localStorage.setItem('whisperville.model-study.id', data.id);
      } catch {
        /* Optional preference. */
      }
      setReport({ id: data.id, status: 'queued', calls: [], trials: [], plannedCalls: planned });
    } catch {
      setError('unavailable');
    } finally {
      if (mounted.current) setPending(false);
    }
  }
  async function cancel() {
    if (report?.id)
      await fetch(`/api/model-studies/${report.id}/cancel`, { method: 'POST' }).catch(() =>
        setError('unavailable'),
      );
  }
  async function replay() {
    const r = await fetch(`/api/model-studies/${report.id}/replay`, { method: 'POST' });
    const data = await r.json();
    setReplayed(Boolean(r.ok && data.ok));
    if (!r.ok) setError('replay-failed');
  }
  function download() {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
      ),
      link = document.createElement('a');
    link.href = url;
    link.download = `whisperville-live-${report.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const knownTokens = (report?.calls || []).reduce(
      (sum, c) => sum + (c.response?.usage?.total_tokens || 0),
      0,
    ),
    unknownTokens = (report?.calls || []).filter(
      (c) => c.response && c.response.usage?.total_tokens == null,
    ).length;
  const errorText = {
    'not-configured': t(
      '请先在设置中保存 API 配置。',
      'Save an API configuration in Settings first.',
    ),
    'process-budget': t(
      '进程请求余额不足，请减少种子数；重启本地服务可重置进程预算。',
      'Insufficient process request budget. Reduce seeds; restarting the local server resets the process budget.',
    ),
    'output-truncated': t(
      '模型返回被输出上限截断，本次已停止且没有自动重试。',
      'The model output hit its limit. The study stopped without retrying.',
    ),
    'study-active': t('已有真实实验在运行。', 'A live study is already running.'),
    'poll-failed': t(
      '读取进度失败，可稍后重试；不要重复启动以免额外计费。',
      'Unable to read progress. Avoid starting another study while this one may be running.',
    ),
  };
  return (
    <Dialog
      className="experiment-lab model-study"
      title={t('真实模型 · 私有信息协作试跑', 'Live model · Private-information pilot')}
      onClose={onClose}
    >
      <nav className="lab-chart-tabs">
        <button disabled={running || pending} onClick={onRules}>
          {t('规则基线', 'Rule baseline')}
        </button>
        <button className="active">{t('真实模型', 'Live model')}</button>
      </nav>
      <div className="lab-intro">
        <span className="lab-kicker">
          {t(
            '独立上下文 · 真实 HTTP 请求 · 无规则补答',
            'PRIVATE CONTEXTS · REAL HTTP REQUESTS · NO RULE ANSWERS',
          )}
        </span>
        <h3>
          {t(
            '四位居民能否把各自掌握的信息拼起来？',
            'Can four residents pool their private information?',
          )}
        </h3>
        <p>
          {t(
            '每位居民只知道自己的一个数，任务是提交全部四个数的升序列表。对同一任务比较允许通信／禁止通信；每位居民各调用两轮，所有消息在整轮结束后才投递。',
            'Each resident knows one private number. Submit all four in ascending order. Compare communication enabled/disabled on the same task, with two calls per resident and messages delivered after each complete round.',
          )}
        </p>
      </div>
      <div className="info-box">
        {status?.configured
          ? t(
              `当前模型：${status.model}。点击下方按钮才会发起云端调用。`,
              `Configured model: ${status.model}. Calls start only when you press the button below.`,
            )
          : t(
              '尚未读取到模型配置，请先完成 API 设置。',
              'No model configuration loaded. Complete API settings first.',
            )}
      </div>
      {needsRestart && (
        <p role="alert">
          {t(
            '请重启本地 npm run dev，再刷新页面，以启用更新后的实验上限。',
            'Restart npm run dev and refresh to use the updated study limits.',
          )}
        </p>
      )}
      <form
        className="lab-config"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <fieldset disabled={running || pending}>
          <label>
            {t('起始种子', 'First seed')}
            <input
              type="number"
              min="0"
              max="2147483640"
              required
              value={seedStart}
              onChange={(e) => setSeedStart(Number(e.target.value))}
            />
          </label>
          <label>
            {t('任务种子数（试跑）', 'Task seeds (pilot)')}
            <input
              type="number"
              min="1"
              max="3"
              required
              value={seeds}
              onChange={(e) => setSeeds(Number(e.target.value))}
            />
          </label>
        </fieldset>
        <p className="lab-caption">
          {t(
            `上限 ${planned} 次真实请求，每次最多 ${tokenCap} 输出 token，输入 token 另计。费用按服务商定价。无自动重试；失败明确记录。`,
            `At most ${planned} real requests, each capped at ${tokenCap} output tokens; input tokens are additional. Provider pricing applies. No automatic retries; failures are recorded.`,
          )}
        </p>
        <div className="lab-run-actions">
          <button
            className="primary-button"
            disabled={!status?.configured || running || pending || needsRestart}
          >
            {t(
              `发起真实 API 实验（最多 ${planned} 次）`,
              `Start live API study (up to ${planned} calls)`,
            )}
          </button>
          {running && (
            <button type="button" className="secondary-button" onClick={cancel}>
              {t('停止后续调用', 'Stop further calls')}
            </button>
          )}
        </div>
      </form>
      {(error || report?.errorCode) && (
        <p role="alert">
          {errorText[error || report?.errorCode] ||
            t(
              '本次实验未完整完成，请查看调用记录；没有使用规则答案补齐。',
              'This study did not finish. Inspect its traces; no rule answers were substituted.',
            )}
        </p>
      )}
      {report && (
        <section className="lab-report">
          <h3>
            {t('调用记录', 'Call record')} · {report.status}
          </h3>
          <p className="lab-caption">{report.model}</p>
          <p>
            {report.calls.length}/{report.plannedCalls} {t('次已尝试', 'attempted')} · {knownTokens}{' '}
            {t('已报告 token', 'reported tokens')}
            {unknownTokens > 0
              ? ` · ${unknownTokens} ${t('次未报告用量', 'calls without usage')}`
              : ''}
          </p>
          <progress
            className="lab-progress"
            max={report.plannedCalls}
            value={report.calls.length}
          />
          <div className="dialog-actions">
            <button className="secondary-button" onClick={download}>
              {t('下载原始记录 JSON', 'Download raw JSON')}
            </button>
            <button
              className="secondary-button"
              disabled={report.status !== 'completed'}
              onClick={replay}
            >
              {t('核验回放（不调用 API）', 'Verify replay (no API calls)')}
            </button>
          </div>
          {replayed && (
            <p role="status">
              {t('回放核验一致；没有新增模型调用。', 'Replay matches; no additional model calls.')}
            </p>
          )}
          <div className="lab-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('种子', 'Seed')}</th>
                  <th>{t('条件', 'Condition')}</th>
                  <th>{t('完成任务', 'Task solved')}</th>
                  <th>{t('投递消息', 'Messages delivered')}</th>
                </tr>
              </thead>
              <tbody>
                {report.trials.map((trial) => (
                  <tr key={`${trial.seed}-${trial.condition}`}>
                    <td>{trial.seed}</td>
                    <td>
                      {trial.condition === 'communication'
                        ? t('允许通信', 'Communication')
                        : t('禁止通信', 'No communication')}
                    </td>
                    <td>
                      {trial.score
                        ? trial.score.solved
                          ? t('是', 'Yes')
                          : t('否', 'No')
                        : t('未完成', 'Incomplete')}
                    </td>
                    <td>{trial.messages.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="lab-trace">
            <summary>
              {t('逐次输入与模型原始返回', 'Per-call inputs and raw model outputs')}
            </summary>
            {report.calls.map((call, i) => (
              <article key={i}>
                <small>
                  #{i + 1} · {call.agent} · {call.condition} · {call.status} ·{' '}
                  {call.durationMs ?? '…'} ms
                </small>
                <pre>
                  {JSON.stringify(
                    {
                      input: call.request?.messages,
                      rawOutput: call.response?.content,
                      usage: call.response?.usage,
                    },
                    null,
                    2,
                  )}
                </pre>
              </article>
            ))}
          </details>
        </section>
      )}
      <details className="lab-method">
        <summary>{t('试跑能说明什么？', 'What does this pilot establish?')}</summary>
        <p>
          {t(
            '这是固定四人、两轮同步的零样本协议试验，没有训练或共享奖励。禁止通信时居民缺少完整信息，因此差异首先用于检查信息传递是否真正生效，不能据此宣称通用协作优越性。1–3 个种子不用于统计显著性结论。',
            'This is a four-agent, two-round zero-shot protocol test, without training or shared rewards. The no-communication condition lacks complete information, so differences primarily validate information transfer, not general cooperative superiority. One to three seeds do not support significance claims.',
          )}
        </p>
        <p>
          {t(
            '模型请求固定使用英文，避免切换界面语言成为实验变量。种子只固定任务数据，不能保证远端模型逐字复现。关闭窗口会请求取消后续调用；已发送的请求可能仍计费。',
            'Model prompts use English to hold language constant. Seeds fix task data, not remote model outputs. Closing requests cancellation; already-sent requests may still be billed.',
          )}
        </p>
      </details>
    </Dialog>
  );
}
