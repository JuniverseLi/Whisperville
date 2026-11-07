import './experiment.css';
import { useEffect, useRef, useState } from 'react';
import { FlaskConical, Download, Play, Square } from 'lucide-react';
import Dialog from './Dialog.jsx';
import { useLanguage } from './Language.jsx';
import { personText, messageText } from '../i18n.js';
import {
  DEFAULT_EXPERIMENT,
  POLICIES,
  validateExperiment,
  experimentCsv,
} from '../simulation/experiments.js';

const COLORS = { none: '#8b8371', random: '#b9803c', degree: '#467e99', bridge: '#6b854b' };
const pct = (value) => `${(value * 100).toFixed(1)}%`;
const signed = (value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}`;

export default function ExperimentLab({ report, onReport, onClose, onLive }) {
  const { language, t } = useLanguage();
  const [config, setConfig] = useState(() => ({ ...(report?.config || DEFAULT_EXPERIMENT) }));
  const [running, setRunning] = useState(false),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(false),
    [metric, setMetric] = useState('sourceCoverage'),
    [hover, setHover] = useState(null),
    [seedIndex, setSeedIndex] = useState(0),
    [policy, setPolicy] = useState('bridge');
  const worker = useRef(null);
  useEffect(() => () => worker.current?.terminate(), []);
  const label = (key) =>
    ({
      none: t('不额外介入', 'No extra intervention'),
      random: t('随机居民', 'Random resident'),
      degree: t('联系最多', 'Highest out-degree'),
      bridge: t('桥梁节点', 'Highest betweenness'),
    })[key];
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    setRunning(false);
  }
  function run(event) {
    event.preventDefault();
    if (!validateExperiment(config)) {
      setError(true);
      return;
    }
    stop();
    setError(false);
    setRunning(true);
    setProgress(0);
    const task = new Worker(new URL('../simulation/experiment-worker.js', import.meta.url), {
      type: 'module',
    });
    worker.current = task;
    task.onmessage = (event) => {
      if (event.data.type === 'progress') setProgress(event.data.completed / event.data.total);
      else if (event.data.type === 'result') {
        onReport(event.data.report);
        setHover(null);
        setSeedIndex(0);
        stop();
      } else {
        setError(true);
        stop();
      }
    };
    task.onerror = () => {
      setError(true);
      stop();
    };
    task.postMessage(config);
  }
  function download(kind) {
    const value = kind === 'json' ? JSON.stringify(report, null, 2) : experimentCsv(report);
    const url = URL.createObjectURL(
      new Blob([value], { type: kind === 'json' ? 'application/json' : 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `whisperville-${report.engineVersion}-${report.config.seedStart}.${kind}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selected = report?.trials.find(
    (trial) => trial.seed === report.config.seedStart + seedIndex && trial.policy === policy,
  );
  const round = hover ?? report?.config.rounds;
  return (
    <Dialog
      className="experiment-lab"
      title={t('耳语镇 · 传播实验室', 'Whisperville · Diffusion lab')}
      onClose={onClose}
    >
      <nav className="lab-chart-tabs">
        <button className="active">{t('规则基线', 'Rule baseline')}</button>
        <button disabled={running} onClick={onLive}>
          {t('真实模型', 'Live model')}
        </button>
      </nav>
      <div className="lab-intro">
        <div>
          <span className="lab-kicker">
            <FlaskConical size={14} />
            {t(
              '规则基线 · 固定 25 人 · 不调用模型',
              'RULE BASELINE · 25 RESIDENTS · NO MODEL CALLS',
            )}
          </span>
          <h3>
            {t(
              '同样新增一次介入，先把公告交给谁？',
              'One extra intervention. Who should get the notice?',
            )}
          </h3>
          <p>
            {t(
              '随机选人、选联系最多的人，还是选常处在最短联系路径上的桥梁节点？对同一组种子分别运行四个条件。',
              'Random selection, most outgoing contacts, or a bridge on many shortest contact paths? Run four conditions on the same seeds.',
            )}
          </p>
        </div>
      </div>
      <form className="lab-config" onSubmit={run}>
        <fieldset disabled={running}>
          <label>
            {t('起始种子', 'First seed')}
            <input
              name="seedStart"
              type="number"
              min="0"
              max="4294967195"
              required
              value={config.seedStart}
              onChange={(e) => setConfig({ ...config, seedStart: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('配对种子数', 'Paired seeds')}
            <input
              name="seeds"
              type="number"
              min="5"
              max="100"
              required
              value={config.seeds}
              onChange={(e) => setConfig({ ...config, seeds: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('观察段数', 'Segments')}
            <input
              name="rounds"
              type="number"
              min="6"
              max="36"
              required
              value={config.rounds}
              onChange={(e) => setConfig({ ...config, rounds: Number(e.target.value) })}
            />
          </label>
          <label>
            {t('介入时点（段）', 'Intervention segment')}
            <input
              name="interventionRound"
              type="number"
              min="1"
              max="4"
              required
              value={config.interventionRound}
              onChange={(e) => setConfig({ ...config, interventionRound: Number(e.target.value) })}
            />
          </label>
        </fieldset>
        <div className="lab-run-actions">
          <button className="primary-button" disabled={running}>
            <Play size={13} />
            {t('运行配对实验', 'Run paired experiment')}
          </button>
          {running && (
            <button type="button" className="secondary-button" onClick={stop}>
              <Square size={12} />
              {t('停止', 'Stop')}
            </button>
          )}
          <span>
            {running
              ? t(
                  `正在运行 ${Math.round(progress * 100)}%`,
                  `Running ${Math.round(progress * 100)}%`,
                )
              : t(
                  '在后台线程运行，可随时停止。',
                  'Runs in a background worker; cancel at any time.',
                )}
          </span>
        </div>
      </form>
      {running && (
        <progress
          className="lab-progress"
          max="1"
          value={progress}
          aria-label={t('实验进度', 'Experiment progress')}
        />
      )}
      {error && (
        <p role="alert">
          {t(
            '实验未完成，请检查参数或重新运行。',
            'The experiment did not complete. Check the parameters or try again.',
          )}
        </p>
      )}
      <details className="lab-method" open={!report}>
        <summary>{t('实验设定与边界', 'Protocol and limitations')}</summary>
        <p>
          {t(
            '固定学校场景：林朵起初有传闻，乔安有可靠公告。指定时点向一位尚未核实的居民额外提供一次公告。三个介入组各花一次预算，对照组不额外介入。联系网络、规则和种子范围保持一致。',
            'Fixed school scenario: Lin begins with a rumor and Qiao with a reliable notice. At the chosen segment, give one additional notice to an unverified resident. Intervention groups each spend one unit; the control spends none. Contact graph, rules and seed range match.',
          )}
        </p>
        <p>
          {t(
            '这里运行抽象联系人网络，没有地图赶路、模型推理或强化学习。收到可靠来源后不可被传闻覆盖，是引擎硬规则。结果只能解释本模拟器中的机制，不能证明 AI 自主协作或现实人群行为。',
            'This uses an abstract contact graph, without map travel, model inference or reinforcement learning. Reliable sources cannot be overwritten by rumors: that is an engine rule. Results describe this simulator, not autonomous AI cooperation or real human populations.',
          )}
        </p>
        <p>
          {t(
            '统计区间采用 1000 次自助法重采样；策略差异以相同种子配对。小样本和单一设定不足以形成一般结论。',
            'Intervals use 1,000 bootstrap resamples; policy differences are paired by seed. Small samples and a single setup cannot establish a general conclusion.',
          )}
        </p>
      </details>
      {report && (
        <section className="lab-report" aria-label={t('实验报告', 'Experiment report')}>
          <div className="lab-report-heading">
            <div>
              <span className="lab-kicker">{report.engineVersion}</span>
              <h3>
                {t(
                  `${report.config.seeds} 个种子 × 4 个条件`,
                  `${report.config.seeds} seeds × 4 conditions`,
                )}
              </h3>
              <small>
                {t(
                  `第 ${report.config.interventionRound} 段介入 · 观察 ${report.config.rounds} 段 · 模型调用 0 次`,
                  `Intervene at segment ${report.config.interventionRound} · ${report.config.rounds} segments · 0 model calls`,
                )}
              </small>
            </div>
            <div>
              <button className="secondary-button" onClick={() => download('json')}>
                <Download size={12} />
                JSON
              </button>
              <button className="secondary-button" onClick={() => download('csv')}>
                CSV
              </button>
            </div>
          </div>
          <div className="lab-chart-tabs">
            <button
              className={metric === 'sourceCoverage' ? 'active' : ''}
              onClick={() => setMetric('sourceCoverage')}
            >
              {t('可靠来源覆盖', 'Reliable-source coverage')}
            </button>
            <button
              className={metric === 'rumorCoverage' ? 'active' : ''}
              onClick={() => setMetric('rumorCoverage')}
            >
              {t('未核实传闻占比', 'Unverified rumor share')}
            </button>
          </div>
          <svg
            className="lab-chart"
            viewBox="0 0 720 245"
            role="img"
            aria-label={t(
              '四种介入条件的平均传播曲线',
              'Mean diffusion curves for four intervention conditions',
            )}
            onPointerLeave={() => setHover(null)}
            onPointerMove={(event) => {
              const b = event.currentTarget.getBoundingClientRect();
              setHover(
                Math.max(
                  0,
                  Math.min(
                    report.config.rounds,
                    Math.round(
                      ((((event.clientX - b.left) / b.width) * 720 - 52) / 638) *
                        report.config.rounds,
                    ),
                  ),
                ),
              );
            }}
          >
            {[0, 0.25, 0.5, 0.75, 1].map((value) => (
              <g key={value}>
                <line
                  x1="52"
                  x2="690"
                  y1={210 - value * 190}
                  y2={210 - value * 190}
                  stroke="#dfd3b4"
                />
                <text x="42" y={214 - value * 190} textAnchor="end">
                  {value * 100}%
                </text>
              </g>
            ))}
            <line
              x1={52 + (638 * report.config.interventionRound) / report.config.rounds}
              x2={52 + (638 * report.config.interventionRound) / report.config.rounds}
              y1="20"
              y2="210"
              stroke="#b9a888"
              strokeDasharray="3 4"
            />
            {report.summary.map((group) => (
              <polyline
                key={group.policy}
                fill="none"
                stroke={COLORS[group.policy]}
                strokeWidth="2.5"
                strokeDasharray={group.policy === 'none' ? '6 4' : undefined}
                points={group.curve
                  .map(
                    (p) =>
                      `${52 + (638 * p.round) / report.config.rounds},${210 - p[metric] * 190}`,
                  )
                  .join(' ')}
              />
            ))}
            <line
              x1={52 + (638 * round) / report.config.rounds}
              x2={52 + (638 * round) / report.config.rounds}
              y1="20"
              y2="210"
              stroke="#927b5a"
              opacity=".4"
            />
            {[0, Math.round(report.config.rounds / 2), report.config.rounds].map((value) => (
              <text
                key={value}
                x={52 + (638 * value) / report.config.rounds}
                y="232"
                textAnchor="middle"
              >
                {value}
              </text>
            ))}
          </svg>
          <div className="lab-legend">
            {report.summary.map((group) => (
              <span key={group.policy}>
                <i style={{ background: COLORS[group.policy] }} />
                {label(group.policy)} <b>{pct(group.curve[round][metric])}</b>
              </span>
            ))}
          </div>
          <p className="lab-caption">
            {t(
              `第 ${round} 段 · 曲线为种子均值。表格区间表示模拟种子之间的变异。`,
              `Segment ${round} · Curves are seed means. Table intervals describe variation across simulation seeds.`,
            )}
          </p>
          <div className="lab-table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t('条件', 'Condition')}</th>
                  <th>
                    {t('最终可靠来源覆盖（95% 区间）', 'Final source coverage (95% interval)')}
                  </th>
                  <th>{t('全程平均覆盖 AUC', 'Time-averaged coverage AUC')}</th>
                  <th>{t('平均转述次数', 'Mean retellings')}</th>
                </tr>
              </thead>
              <tbody>
                {report.summary.map((group) => (
                  <tr key={group.policy}>
                    <th>
                      <i style={{ background: COLORS[group.policy] }} />
                      {label(group.policy)}
                    </th>
                    <td>
                      {pct(group.metrics.sourceCoverage.mean)}{' '}
                      <small>
                        [{pct(group.metrics.sourceCoverage.low)},{' '}
                        {pct(group.metrics.sourceCoverage.high)}]
                      </small>
                    </td>
                    <td>{pct(group.metrics.sourceAuc.mean)}</td>
                    <td>{group.metrics.messages.mean.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lab-paired">
            {report.paired.map((pair) => (
              <article key={pair.policy}>
                <strong>
                  {label(pair.policy)} − {label('random')}
                </strong>
                <p>
                  {signed(pair.difference.mean)}{' '}
                  <small>{t('百分点 AUC', 'percentage points AUC')}</small>
                </p>
                <span>
                  95% CI [{signed(pair.difference.low)}, {signed(pair.difference.high)}]
                </span>
                <small>
                  {pair.difference.low <= 0 && pair.difference.high >= 0
                    ? t(
                        '区间跨过 0，未显示稳定差异。',
                        'Interval crosses zero; no stable difference shown.',
                      )
                    : t(
                        '差异仅针对本次规则与种子范围。',
                        'Difference applies to this rule setup and seed range.',
                      )}
                </small>
              </article>
            ))}
          </div>
          <details className="lab-trace">
            <summary>
              {t('核查单次运行与消息来源', 'Audit a trial and its message sources')}
            </summary>
            <div className="lab-trace-select">
              <label>
                {t('种子', 'Seed')}
                <select value={seedIndex} onChange={(e) => setSeedIndex(Number(e.target.value))}>
                  {Array.from({ length: report.config.seeds }, (_, i) => (
                    <option key={i} value={i}>
                      {report.config.seedStart + i}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t('条件', 'Condition')}
                <select value={policy} onChange={(e) => setPolicy(e.target.value)}>
                  {POLICIES.map((p) => (
                    <option key={p} value={p}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p>
              {t('额外介入对象：', 'Additional notice recipient: ')}
              {selected?.target
                ? personText(selected.target, 'name', language)
                : t('无', 'None')} · {t('花费预算：', 'Budget used: ')}
              {selected?.interventionsUsed}
            </p>
            {selected?.messages.slice(-12).map((m) => (
              <article key={m.id}>
                <small>
                  {t(`第 ${m.round} 段`, `Segment ${m.round}`)} ·{' '}
                  {personText(m.sender, 'name', language)} →{' '}
                  {personText(m.receiver, 'name', language)} · {m.id} ←{' '}
                  {m.parentId || t('源头', 'root')}
                </small>
                <p>{messageText(m, language)}</p>
              </article>
            ))}
            <p className="lab-caption">
              {t(
                '显示末 12 条，完整来源链、逐段指标和全部种子均在 JSON 中。',
                'Last 12 messages shown. JSON includes full source chains, per-segment metrics and every seed.',
              )}
            </p>
          </details>
        </section>
      )}
    </Dialog>
  );
}
