import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Download,
  GitBranch,
  MapPin,
  Play,
  Pause,
  Radio,
} from 'lucide-react';
import { useLanguage } from './Language.jsx';
import { personText, messageText, claimText } from '../i18n.js';
import { getScenario } from '../simulation/scenarios.js';
import {
  cascadeLayout,
  eventChain,
  propagationCsv,
  propagationSnapshot,
} from '../simulation/propagation.js';
import './propagation.css';

export default function PropagationView({
  game,
  onClose,
  onLocate,
  onStep,
  canStep,
  busy,
  onIntervene,
  stepping,
  meeting,
  speed,
  onSpeed,
}) {
  const { t, language } = useLanguage(),
    scene = getScenario(game);
  const [round, setRound] = useState(game.round),
    [root, setRoot] = useState('all'),
    [picked, setPicked] = useState(game.messages.at(-1)?.id || null),
    [replaying, setReplaying] = useState(false);
  const previousRound = useRef(game.round),
    graphRef = useRef(null);
  const snapshot = useMemo(() => propagationSnapshot(game, round), [game, round]);
  const layout = useMemo(
    () => cascadeLayout(snapshot, root === 'all' ? null : root),
    [snapshot, root],
  );
  const selected = snapshot.events.find((e) => e.message.id === picked),
    chain = eventChain(snapshot, picked),
    chainIds = new Set(chain.map((e) => e.message.id));
  const name = (id) => personText(id, 'name', language),
    text = (m) => messageText(m, language);
  const typeName = (type) =>
    ({
      origin: t('初始源头', 'Initial source'),
      intervention: t('外部介入', 'Intervention'),
      retelling: t('转述', 'Retelling'),
      mutation: t('类别改变', 'Category change'),
      correction: t('纠正认知', 'Belief correction'),
    })[type];
  const beliefText = (state) =>
    state.claim === null ? t('尚未听说', 'Unaware') : claimText(state.claim, language, game);
  const choose = (id) => {
    setPicked(id);
  };
  useEffect(() => {
    const following = round === previousRound.current;
    previousRound.current = game.round;
    if (following) {
      setRound(game.round);
      setPicked(game.messages.at(-1)?.id || null);
    }
  }, [game.round, game.messages.length]);
  useEffect(() => {
    if (!replaying) return;
    const timer = setInterval(
      () =>
        setRound((value) => {
          if (value >= game.round) {
            setReplaying(false);
            return value;
          }
          return value + 1;
        }),
      1600,
    );
    return () => clearInterval(timer);
  }, [replaying, game.round]);
  useEffect(() => {
    if (!snapshot.events.some((e) => e.message.id === picked))
      setPicked(snapshot.events.at(-1)?.message.id || null);
    if (root !== 'all' && !snapshot.roots.some((e) => e.message.id === root)) setRoot('all');
  }, [round]);
  useEffect(() => {
    const event = snapshot.events.find((e) => e.message.id === picked);
    if (!event) return;
    if (root !== 'all' && event.rootId !== root) setRoot(event.rootId);
    requestAnimationFrame(() => {
      const card = graphRef.current?.querySelector(`[data-message="${picked}"]`);
      card?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    });
  }, [picked, root]);
  const eventsHere = snapshot.events.filter((e) => e.message.round === round);
  const eventSummary = eventsHere.filter((e) => e.message.parentId);
  function download() {
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + propagationCsv(game)], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'whisperville-transmissions.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="propagation-view" aria-label={t('传播观察台', 'Transmission observatory')}>
      <header className="prop-heading">
        <div>
          <span className="prop-eyebrow">
            <Radio size={13} />
            WHISPERVILLE / COMMUNICATION OBSERVATORY
          </span>
          <h1>{t('让每一次传播，都有迹可循。', 'Follow the life of a message.')}</h1>
          <p>
            {t(scene.title, scene.titleEn)}{' '}
            {game.recordingMode === 'scripted-rule-walkthrough' && (
              <b>{t(' · 固定接触序列示例', ' · Controlled contact walkthrough')}</b>
            )}{' '}
            <span>·</span>{' '}
            {t(
              '只展示已发生的消息，不把社交联系当作传播',
              'Committed messages only. Social ties are not transmission events.',
            )}
          </p>
        </div>
        <button className="prop-return" onClick={onClose}>
          <MapPin size={14} />
          {t('返回小镇', 'Back to town')}
        </button>
      </header>
      <div className="prop-metrics">
        <article>
          <small>{t('已触达居民', 'RESIDENTS REACHED')}</small>
          <strong>
            {snapshot.metrics.reached}
            <em>/25</em>
          </strong>
          <span>{t('至少收到一条场景消息', 'At least one scenario message')}</span>
        </article>
        <article className="reliable">
          <small>{t('有可靠来源', 'RELIABLE SOURCE')}</small>
          <strong>
            {snapshot.metrics.reliable}
            <em>{t('人', 'people')}</em>
          </strong>
          <span>{t('来自公告或有依据的转述', 'Notice or source-backed retelling')}</span>
        </article>
        <article className="rumor">
          <small>{t('当前未经核实', 'CURRENTLY UNVERIFIED')}</small>
          <strong>
            {snapshot.metrics.rumor}
            <em>{t('人', 'people')}</em>
          </strong>
          <span>{t('当前认知仍来自传闻', 'Current belief comes from hearsay')}</span>
        </article>
        <article>
          <small>{t('转述 / 类别变化', 'RETELLINGS / CATEGORY CHANGES')}</small>
          <strong>
            {snapshot.metrics.retellings}
            <em>/ {snapshot.metrics.categoryChanges}</em>
          </strong>
          <span>
            {t('变化按 claim 类别比较，不判读语义', 'Changes compare claim labels, not semantics')}
          </span>
        </article>
      </div>
      <div className="prop-body">
        <div className="prop-main">
          <div className="prop-timebar">
            <button
              onClick={() => {
                setReplaying(false);
                setRound(Math.max(0, round - 1));
              }}
              disabled={round === 0}
              aria-label={t('前一段记录', 'Previous recorded segment')}
            >
              <ArrowLeft size={14} />
            </button>
            <button
              onClick={() => {
                if (round === game.round) setRound(0);
                setReplaying((v) => !v);
              }}
              disabled={game.round === 0}
              aria-label={t(
                replaying ? '暂停回看' : '播放已有记录',
                replaying ? 'Pause record playback' : 'Play recorded segments',
              )}
            >
              {replaying ? <Pause size={14} /> : <Play size={14} />}
            </button>
            <div>
              <strong>{t(`第 ${round} 段`, `Segment ${round}`)}</strong>
              <small>
                {round === game.round
                  ? t('当前记录', 'Latest record')
                  : t('历史回看 · 不改变模拟', 'History · does not change the town')}
              </small>
            </div>
            <input
              type="range"
              min="0"
              max={game.round}
              value={round}
              onChange={(e) => {
                setReplaying(false);
                setRound(Number(e.target.value));
              }}
              aria-label={t('传播时间轴', 'Transmission timeline')}
            />
            <span>0—{game.round}</span>
            <button
              onClick={() => {
                setReplaying(false);
                setRound(Math.min(game.round, round + 1));
              }}
              disabled={round === game.round}
              aria-label={t('后一段记录', 'Next recorded segment')}
            >
              <ArrowRight size={14} />
            </button>
          </div>
          <div className="prop-narration" role="status">
            <b>{t('这一段', 'THIS SEGMENT')}</b>
            <p>
              {eventSummary.length
                ? eventSummary
                    .map(
                      (e) =>
                        `${name(e.message.sender)} → ${name(e.message.receiver)}${e.categoryChanged ? t('（说法类别改变）', ' (category changed)') : e.type === 'correction' ? t('（获得可靠来源）', ' (received a source)') : ''}`,
                    )
                    .join('；')
                : eventsHere.length
                  ? t(
                      '初始消息或外部线索已进入小镇，还没有居民间的转述。',
                      'A source has entered town; no resident retelling in this segment.',
                    )
                  : t(
                      '这一段没有新的场景消息。居民活动与闲聊仍可能发生。',
                      'No scenario messages in this segment. Daily activity and casual chat may still occur.',
                    )}
            </p>
          </div>
          <div className="prop-graph-heading">
            <div>
              <GitBranch size={15} />
              <strong>{t('实际传播链', 'Observed cascades')}</strong>
            </div>
            <label>
              {t('查看源头', 'Source')}
              <select
                value={root}
                onChange={(e) => {
                  setRoot(e.target.value);
                  setPicked(
                    e.target.value === 'all' ? snapshot.events.at(-1)?.message.id : e.target.value,
                  );
                }}
                aria-label={t('筛选消息源头', 'Filter message source')}
              >
                <option value="all">{t('全部源头', 'All sources')}</option>
                {snapshot.roots.map((e) => (
                  <option key={e.message.id} value={e.message.id}>
                    {e.message.evidence
                      ? t('可靠来源', 'Reliable source')
                      : t('传闻起点', 'Rumor origin')}{' '}
                    · {name(e.message.receiver)} · {e.message.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="prop-legend">
            <span className="key reliable" /> {t('有依据', 'Source-backed')}
            <span className="key rumor" /> {t('未核实', 'Unverified')}
            <span className="key mutation" /> {t('类别改变', 'Category changed')}
            <small>
              {t(
                '一张卡片 = 一次实际收到消息；箭头 = parentId 来源',
                'One card = a received message; arrow = parentId provenance',
              )}
            </small>
          </div>
          <div
            className="prop-graph-scroll"
            ref={graphRef}
            tabIndex="0"
            aria-label={t('可滚动的传播链图', 'Scrollable cascade diagram')}
          >
            {layout.nodes.length ? (
              <div
                className="prop-graph-surface"
                style={{ width: layout.width, height: layout.height }}
              >
                {Array.from(
                  { length: Math.max(1, ...layout.nodes.map((n) => n.depth + 1)) },
                  (_, d) => (
                    <div className="prop-depth" key={d} style={{ left: 28 + d * 240 }}>
                      {d === 0 ? t('源头', 'ORIGIN') : t(`第 ${d} 跳`, `HOP ${d}`)}
                    </div>
                  ),
                )}
                <svg width={layout.width} height={layout.height} aria-hidden="true">
                  <defs>
                    <marker
                      id="prop-arrow"
                      markerWidth="6"
                      markerHeight="6"
                      refX="5"
                      refY="3"
                      orient="auto"
                    >
                      <path d="M0,0 L6,3 L0,6" fill="context-stroke" />
                    </marker>
                  </defs>
                  {layout.edges.map((edge) => {
                    const a = layout.nodes.find((n) => n.message.id === edge.from),
                      b = layout.nodes.find((n) => n.message.id === edge.to),
                      highlight = chainIds.has(a.message.id) && chainIds.has(b.message.id);
                    return (
                      <path
                        key={edge.to}
                        className={highlight ? 'selected' : ''}
                        stroke={
                          b.categoryChanged ? '#b96b46' : b.message.evidence ? '#6f8c65' : '#b69550'
                        }
                        strokeWidth={highlight ? 3 : 1.5}
                        opacity={picked && !highlight ? 0.32 : 1}
                        fill="none"
                        markerEnd="url(#prop-arrow)"
                        d={`M${a.x + 208},${a.y} C${a.x + 229},${a.y} ${b.x - 20},${b.y} ${b.x - 3},${b.y}`}
                      />
                    );
                  })}
                </svg>
                {layout.nodes.map((e) => (
                  <button
                    key={e.message.id}
                    data-message={e.message.id}
                    style={{ left: e.x, top: e.y - 37 }}
                    className={`prop-node ${e.categoryChanged ? 'mutation' : e.message.evidence ? 'reliable' : 'rumor'} ${picked === e.message.id ? 'selected' : ''} ${chainIds.has(e.message.id) ? 'in-chain' : ''}`}
                    onClick={() => choose(e.message.id)}
                    aria-label={t(
                      `查看传播 ${e.message.id}：${name(e.message.receiver)}`,
                      `Inspect transmission ${e.message.id}: ${name(e.message.receiver)}`,
                    )}
                    aria-pressed={picked === e.message.id}
                  >
                    <span>
                      {e.message.parentId ? `${name(e.message.sender)} → ` : ''}
                      <b>{name(e.message.receiver)}</b>
                      <time>{t(`第${e.message.round}段`, `S${e.message.round}`)}</time>
                    </span>
                    <p>{claimText(e.message.claim, language, game)}</p>
                    <small>
                      {typeName(e.type)} <i>·</i> {e.message.id}
                    </small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="prop-empty">
                <GitBranch size={30} />
                <h3>{t('还没有场景消息可追踪', 'No scenario messages to trace yet')}</h3>
                <p>
                  {t(
                    scene.id === 'free-day'
                      ? '自由生活不预置传闻。换到学校或找猫场景，观察消息传播；闲聊不计入这里。'
                      : '点击「观察下一段」，居民真正见面后，传播会出现在这里。',
                    scene.id === 'free-day'
                      ? 'Free living has no seeded rumors. Choose School or Missing Cat to follow information. Casual chat is excluded.'
                      : 'Use Next segment. A real meeting must complete before a transmission appears.',
                  )}
                </p>
              </div>
            )}
          </div>
          <div className="prop-events">
            <h3>
              {t('本段事件', 'Events in this segment')}
              <small>{eventsHere.length}</small>
            </h3>
            <div>
              {eventsHere.map((e) => (
                <button
                  key={e.message.id}
                  className={e.message.id === picked ? 'active' : ''}
                  onClick={() => choose(e.message.id)}
                >
                  <i
                    className={
                      e.message.evidence ? 'reliable' : e.categoryChanged ? 'mutation' : 'rumor'
                    }
                  />
                  <span>
                    <b>
                      {e.message.parentId ? name(e.message.sender) : t('源头', 'Source')} →{' '}
                      {name(e.message.receiver)}
                    </b>
                    <small>
                      {typeName(e.type)} · {e.message.mode === 'ai' ? 'API' : t('规则', 'Rules')}
                    </small>
                  </span>
                  <ArrowRight size={12} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <aside className="prop-detail" aria-label={t('传播详情', 'Transmission details')}>
          {selected ? (
            <>
              <span className="prop-eyebrow">
                {t('选中一次传播', 'INSPECT A TRANSMISSION')} · {selected.message.id}
              </span>
              <h2>
                {selected.message.parentId
                  ? `${name(selected.message.sender)} → `
                  : t('消息源 → ', 'Source → ')}
                {name(selected.message.receiver)}
              </h2>
              <div
                className={`prop-detail-tag ${selected.message.evidence ? 'reliable' : 'rumor'}`}
              >
                {t(`第 ${selected.message.round} 段`, `Segment ${selected.message.round}`)} ·{' '}
                {typeName(selected.type)} ·{' '}
                {selected.message.mode === 'ai'
                  ? t('真实 API 台词', 'API dialogue')
                  : t('规则台词', 'Rule dialogue')}
              </div>
              <blockquote>{text(selected.message)}</blockquote>
              <section>
                <h3>{t('收到前 → 收到后', 'BEFORE → AFTER RECEIPT')}</h3>
                <div className="belief-comparison">
                  <article>
                    <small>{t('之前', 'Before')}</small>
                    <p>{beliefText(selected.before)}</p>
                  </article>
                  <ArrowRight size={14} />
                  <article className={selected.after.verified ? 'reliable' : ''}>
                    <small>{t('之后', 'After')}</small>
                    <p>{beliefText(selected.after)}</p>
                  </article>
                </div>
                <p className="prop-explanation">
                  {selected.blockedByEvidence
                    ? t(
                        'TA 收到了传闻，但已有可靠来源，当前认知没有被覆盖。这是引擎规则。',
                        'A rumor was received, but an existing source protected the belief. This is an engine rule.',
                      )
                    : selected.changed
                      ? t(
                          '这次接收改变了记录中的认知。',
                          'This receipt changed the recorded belief.',
                        )
                      : t(
                          '这次消息被收到，但认知类别保持不变。',
                          'The message was received; the belief category stayed the same.',
                        )}
                </p>
              </section>
              <section>
                <h3>{t('沿来源回看', 'FOLLOW THE PROVENANCE')}</h3>
                <ol className="prop-chain">
                  {chain.map((e) => (
                    <li key={e.message.id}>
                      <button
                        onClick={() => choose(e.message.id)}
                        className={e.message.id === picked ? 'active' : ''}
                      >
                        <b>{name(e.message.receiver)}</b>
                        <span>
                          {t(
                            `第${e.message.round}段 · ${e.depth}跳`,
                            `Segment ${e.message.round} · hop ${e.depth}`,
                          )}
                        </span>
                        <small>
                          {e.message.id}{' '}
                          {e.message.parentId ? `← ${e.message.parentId}` : t('· 源头', '· root')}
                        </small>
                      </button>
                    </li>
                  ))}
                </ol>
              </section>
              {selected.message.parentId && (
                <section>
                  <h3>{t('转述时改变了什么？', 'WHAT CHANGED IN THE RETELLING?')}</h3>
                  <p className="prop-explanation">
                    {selected.categoryChanged
                      ? t(
                          '接收者听到的 claim 类别与父消息不同。此标记不等于自动判断自然语言失真。',
                          'The claim category differs from the parent message. This does not automatically judge semantic distortion.',
                        )
                      : t(
                          'claim 类别与父消息一致；具体措辞可能不同。',
                          'The claim category matches the parent; wording may differ.',
                        )}
                  </p>
                </section>
              )}
              {scene.fact && (
                <div className="prop-intervention">
                  <small>{t('试一次外部介入', 'TRY AN INTERVENTION')}</small>
                  <p>
                    {t(
                      '直接给这位居民一份可靠线索，新消息会成为独立的来源根。',
                      'Give this resident a reliable source. The new message starts an independent provenance root.',
                    )}
                  </p>
                  <button
                    disabled={
                      busy ||
                      stepping ||
                      round !== game.round ||
                      game.remaining < 1 ||
                      game.residents[selected.message.receiver].verified
                    }
                    onClick={() => onIntervene?.(selected.message.receiver)}
                  >
                    {t(
                      `分享可靠线索（剩余 ${game.remaining} 次）`,
                      `Share source (${game.remaining} left)`,
                    )}
                  </button>
                  {round !== game.round && (
                    <small>
                      {t('回到最新一段后可介入。', 'Return to the latest segment to intervene.')}
                    </small>
                  )}
                </div>
              )}
              <button className="prop-locate" onClick={() => onLocate(selected.message.receiver)}>
                <MapPin size={14} />
                {t(
                  `去小镇看${name(selected.message.receiver)}`,
                  `Find ${name(selected.message.receiver)} in town`,
                )}
              </button>
            </>
          ) : (
            <div className="prop-detail-empty">
              <Radio size={24} />
              <h3>{t('选中一张卡片', 'Select a message card')}</h3>
              <p>
                {t(
                  '查看转述内容、接收者的认知变化与完整来源。',
                  'Inspect wording, belief changes and the full provenance chain.',
                )}
              </p>
            </div>
          )}
        </aside>
      </div>
      <footer className="prop-footer">
        <span role="status">
          {busy
            ? t('模型正在返回本段结果…', 'Waiting for model output…')
            : stepping
              ? t(
                  `居民正在赴约 · ${meeting?.arrived || 0}/${meeting?.total || 0} 组已相遇`,
                  `Residents walking to meet · ${meeting?.arrived || 0}/${meeting?.total || 0} pairs together`,
                )
              : t(
                  '回看只读取已有记录，不调用 API。闲聊不计入传播。',
                  'Playback reads records without API calls. Casual chat is excluded.',
                )}
        </span>
        <div className="prop-speed" aria-label={t('模拟移动速度', 'Simulation movement speed')}>
          {[1, 2, 4].map((value) => (
            <button
              key={value}
              className={speed === value ? 'active' : ''}
              onClick={() => onSpeed?.(value)}
              aria-label={t(`图谱 ${value} 倍速度`, `Observatory ${value}× speed`)}
            >
              {value}×
            </button>
          ))}
        </div>
        <button onClick={download}>
          <Download size={13} />
          {t('导出事件 CSV', 'Export events CSV')}
        </button>
        <button
          className="prop-step"
          disabled={!canStep || busy}
          onClick={() => {
            setReplaying(false);
            setRound(game.round);
            onStep();
          }}
        >
          {busy
            ? t('等待模型…', 'Waiting for model…')
            : stepping
              ? t('居民正在赶路…', 'Residents walking…')
              : t('观察下一段', 'Next segment')}
          <ArrowRight size={14} />
        </button>
      </footer>
    </section>
  );
}
