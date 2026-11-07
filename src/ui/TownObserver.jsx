import PropagationView from './PropagationView.jsx';
import TownSpeech from './TownSpeech.jsx';
import { getScenario } from '../simulation/scenarios.js';
import { useEffect, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipForward,
  Map,
  House,
  Settings2,
  HelpCircle,
  Eye,
  MessageCircle,
  Users,
  X,
  ChevronRight,
  Download,
  ScrollText,
  ZoomIn,
  ZoomOut,
  GitBranch,
} from 'lucide-react';
import { createPixelWorld } from '../game/world.js';
import { createPlayer } from '../game/session.js';
import { RESIDENTS, residentById } from '../simulation/scenario.js';
import { getStats, traceMessage, isFinished } from '../simulation/engine.js';
import PixelPortrait from './CharacterPortrait.jsx';
import { useLanguage } from './Language.jsx';
import { personText, placeText, messageText, claimText } from '../i18n.js';
import { retrieveMemories } from '../simulation/memory.js';
import Dialog from './Dialog.jsx';

export default function TownObserver({
  game,
  onAdvance,
  onIntervene,
  onModal,
  modalOpen,
  busy,
  configuredMode,
  onExport,
  storageFailed,
  advanceError,
  onAudit,
  onClearError,
}) {
  const { language, setLanguage, t } = useLanguage();
  const scene = getScenario(game);
  const [propagationOpen, setPropagationOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [viewMoved, setViewMoved] = useState(false),
    [inspectedOnce, setInspectedOnce] = useState(false),
    [tracedOnce, setTracedOnce] = useState(false),
    [guideVisible, setGuideVisible] = useState(true);
  const name = (id) => personText(id, 'name', language);
  const text = (message) => messageText(message, language);
  const [playing, setPlaying] = useState(false),
    [stepping, setStepping] = useState(false),
    [speed, setSpeed] = useState(1);
  const [selected, setSelected] = useState(scene.focus),
    [inspecting, setInspecting] = useState(() => innerWidth > 700),
    [roster, setRoster] = useState(false),
    [trace, setTrace] = useState(null);
  const [hud, setHud] = useState({ activities: {}, actors: {}, overview: true, cutaway: true }),
    [ready, setReady] = useState(false),
    [hint, setHint] = useState('');
  const canvasRef = useRef(null),
    worldRef = useRef(null),
    liveRef = useRef(null),
    callbacks = useRef(null);
  const playerRef = useRef(createPlayer(game.id));
  const finished = isFinished(game),
    paused = (!playing && !stepping) || finished;
  liveRef.current = {
    game,
    language,
    player: playerRef.current,
    observer: true,
    focus: scene.focus,
    blocked: paused || modalOpen || Boolean(roster || trace || advanceError),
    interactionBlocked: modalOpen || Boolean(roster || trace),
    speechHidden: propagationOpen,
    busy,
    speed,
    quest: null,
  };
  useEffect(() => {
    if (advanceError) {
      setPlaying(false);
      setStepping(false);
    }
  }, [advanceError]);
  callbacks.current = {
    onAdvance,
    onCycleComplete: () => setStepping(false),
    onSelect: (id) => {
      setSelected(id);
      setInspectedOnce(true);
      setInspecting(true);
    },
  };
  useEffect(() => {
    const world = createPixelWorld(canvasRef.current, {
      getState: () => liveRef.current,
      onInteract: (id) => callbacks.current.onSelect(id),
      onSnapshot: setHud,
      onReady: () => setReady(true),
      onConversation: (snapshot) => callbacks.current.onAdvance(snapshot),
      onCycleComplete: () => callbacks.current.onCycleComplete(),
      onHint: setHint,
      onCameraChange: () => setViewMoved(true),
    });
    worldRef.current = world;
    return () => {
      world.dispose();
      worldRef.current = null;
    };
  }, []);
  useEffect(() => {
    if (inspecting && innerWidth <= 700) worldRef.current?.follow(selected);
  }, [inspecting, selected]);
  useEffect(() => {
    if (viewMoved && inspectedOnce && game.round > 0 && tracedOnce) setGuideVisible(false);
  }, [viewMoved, inspectedOnce, game.round, tracedOnce]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        setPlaying(false);
        setStepping(false);
      }
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  useEffect(() => {
    const keys = (e) => {
      if (
        e.code === 'Space' &&
        !modalOpen &&
        !roster &&
        !trace &&
        !['INPUT', 'TEXTAREA', 'BUTTON', 'SUMMARY'].includes(e.target.tagName)
      ) {
        e.preventDefault();
        setStepping(false);
        setPlaying((value) => !value);
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  }, [modalOpen, roster, trace]);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(''), 5000);
    return () => clearTimeout(timer);
  }, [hint]);
  const person = residentById(selected),
    belief = game.residents[selected],
    intent = game.intentions?.find((p) => p.id === selected),
    stats = getStats(game);
  const memories = game.messages
    .filter((m) => m.receiver === selected)
    .slice(-5)
    .reverse();
  const latest = [...game.messages, ...(game.encounters || [])]
    .sort((a, b) => a.round - b.round)
    .filter((m) => residentById(m.sender))
    .slice(-4)
    .reverse();
  const minutes = 540 + game.round * 10,
    clock = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  function select(id, follow = false) {
    setSelected(id);
    setInspectedOnce(true);
    setInspecting(true);
    setRoster(false);
    if (follow) worldRef.current?.follow(id);
  }
  function openTrace(id) {
    setTrace(id);
    setTracedOnce(true);
  }
  function focusResident() {
    select(scene.focus, true);
    setViewMoved(true);
  }
  function stepOnce() {
    if (!ready || busy || stepping || playing || finished) return;
    worldRef.current?.dismissSpeech();
    setPlaying(false);
    setStepping(true);
  }
  const guideStep = !viewMoved
    ? 0
    : !inspectedOnce
      ? 1
      : game.round === 0
        ? 2
        : !tracedOnce
          ? 3
          : 4;
  const advice = [
    t(
      '先环顾四周：按住地图拖动，滚轮放大；也可以直接跟随主角。',
      'Look around: drag the map and scroll to zoom, or follow the main neighbor.',
    ),
    t(
      '点击一个居民，看看「此刻正在」和「下一步打算」有什么不同。',
      'Select a neighbor. Compare what is happening now with their next intention.',
    ),
    t(
      '先逐段看：点「观察下一段」，等居民真正见面，时间才会往前走。',
      'Try one segment: wait for neighbors to actually meet before time advances.',
    ),
    t(
      '打开街角对话，看看是谁告诉了谁；消息可以沿来源回看。',
      'Open a conversation below. See who told whom and follow the source chain.',
    ),
    t(
      '已经会观察了。试试分享可靠线索，或换一种小镇生活。',
      'You know the basics. Share a first-hand clue or try a different day.',
    ),
  ];
  const mind = game.minds?.[selected];
  const traceItems = trace?.startsWith('encounter-')
    ? (game.encounters || []).filter((m) => m.id === trace)
    : traceMessage(game, trace);
  const selectedRecord = [...game.messages, ...(game.encounters || [])].find(
    (message) => message.id === trace,
  );
  const conversationTurns = selectedRecord?.dialogue
    ? [...game.messages, ...(game.encounters || [])]
        .filter((message) => message.dialogue?.id === selectedRecord.dialogue.id)
        .sort((a, b) => a.dialogue.turn - b.dialogue.turn)
    : [];
  const retrieved = retrieveMemories(
    mind,
    `${person.goal || ''} ${intent?.activity || ''}`,
    game.round,
  );
  const rosterPeople = RESIDENTS.filter((p) =>
    `${p.name} ${p.nameEn} ${p.role} ${p.roleEn}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <main
      className={`pixel-game observation-game ${inspecting ? 'has-inspector' : ''} ${propagationOpen ? 'showing-propagation' : ''}`}
      data-round={game.round}
      data-playing={String(!paused)}
    >
      <canvas
        ref={canvasRef}
        className="pixel-world observation-world"
        aria-label={t(
          '小镇观察地图，按住拖动，滚轮缩放，点击居民查看记忆，M 全图，V 房屋透视',
          'Town map. Drag to pan, scroll to zoom, select neighbors; M map, V interiors.',
        )}
      />
      <div className="game-vignette" />
      {advanceError && (
        <section className="live-observation-error paper-panel" role="alert">
          <strong>{t('真实观察已暂停', 'Live observation paused')}</strong>
          <p>{advanceError.message}</p>
          <small>
            {t(
              '本段尚未提交，没有生成替代对话。',
              'This segment has not committed. No substitute dialogue was generated.',
            )}
          </small>
          <div>
            <button
              className="pixel-button"
              onClick={() => {
                onClearError();
                setPlaying(false);
                setStepping(true);
              }}
            >
              {t('手动重试本段', 'Retry this segment')}
            </button>
            <button onClick={() => onModal('settings')}>{t('API 设置', 'API settings')}</button>
            {advanceError.auditId && (
              <button onClick={() => onAudit(advanceError.auditId)}>
                {t('查看失败记录', 'Inspect failed audit')}
              </button>
            )}
          </div>
        </section>
      )}
      {!propagationOpen && !modalOpen && !roster && !trace && (
        <TownSpeech
          speeches={hud.speeches}
          surface={hud.speechSurface}
          onRead={openTrace}
          onDismiss={(id) => worldRef.current?.dismissSpeech(id)}
          onLocate={(id) => {
            worldRef.current?.follow(id);
            setViewMoved(true);
          }}
        />
      )}
      <header className="pixel-header">
        <div className="town-sign">
          <span className="sign-flower">✿</span>
          <div>
            <strong>{t('耳语镇', 'Whisperville')}</strong>
            <small>A DAY IN WHISPERVILLE</small>
          </div>
        </div>
        <div className="observer-top-caption">
          <span>{t('小镇传播观察室', 'Follow the life of a message')}</span>
          <small>
            {t('25 位邻居，各有各的今天。', '25 neighbors. Twenty-five different days.')}
          </small>
        </div>
        <div className="day-card wood-panel">
          <Eye size={22} />
          <div>
            <strong>{t('春 · 1 日 · 星期一', 'Spring 1 · Monday')}</strong>
            <span>
              {clock} <i />
              {configuredMode === 'ai'
                ? game.lifeMode === 'ai'
                  ? t('AI 独立决策', 'Private model decisions')
                  : game.round > 0
                    ? t('等待下一次真实决策', 'Awaiting the next real decision')
                    : t('AI 已配置 · 等待决策', 'Model ready · awaiting decisions')
                : t('等待连接真实 API', 'Waiting for a real API')}
            </span>
            {game.apiBudget && (
              <small className="resident-api-budget">
                {t('API 请求', 'API calls')} {game.apiBudget.used}/{game.apiBudget.limit}
              </small>
            )}
          </div>
        </div>
      </header>
      <nav className="observation-tools wood-panel" aria-label={t('观察工具', 'Observation tools')}>
        <button
          className="prop-tool"
          aria-label={t('打开传播图谱', 'Open transmission observatory')}
          aria-pressed={propagationOpen}
          onClick={() => {
            setPlaying(false);
            setPropagationOpen((value) => !value);
          }}
        >
          <GitBranch size={17} />
          <span>{t('传播图谱', 'Propagation')}</span>
        </button>
        <button
          className="story-tool"
          aria-label={t('切换生活场景', 'Choose a story')}
          title={t('切换生活场景', 'Choose a story')}
          onClick={() => onModal('stories')}
        >
          <ScrollText size={17} />
          <span>{t('故事', 'Stories')}</span>
        </button>

        <button
          aria-label={t('小镇全图', 'Town map')}
          onClick={() => worldRef.current?.toggleMap()}
        >
          <Map size={17} />
          <span>{t('全图 M', 'Map M')}</span>
        </button>
        <button
          aria-label={t('房屋透视', 'Toggle interiors')}
          onClick={() => worldRef.current?.toggleCutaway()}
        >
          <House size={17} />
          <span>{hud.cutaway ? t('显示屋顶', 'Roofs') : t('室内 V', 'Interiors V')}</span>
        </button>
        <button aria-label={t('居民名册', 'Resident directory')} onClick={() => setRoster(true)}>
          <Users size={17} />
          <span>{t('居民', 'Residents')}</span>
        </button>
        <button
          className="help-tool"
          aria-label={t('观察帮助', 'Observation help')}
          onClick={() => onModal('help')}
        >
          <HelpCircle size={17} />
          <span>{t('玩法', 'Guide')}</span>
        </button>
        <button aria-label={t('模型设置', 'Model settings')} onClick={() => onModal('settings')}>
          <Settings2 size={17} />
        </button>
        <button
          aria-label={t('放大地图', 'Zoom in')}
          title={t('放大地图', 'Zoom in')}
          onClick={() => worldRef.current?.zoom(0.25)}
        >
          <ZoomIn size={17} />
        </button>
        <button
          aria-label={t('缩小地图', 'Zoom out')}
          title={t('缩小地图', 'Zoom out')}
          onClick={() => worldRef.current?.zoom(-0.25)}
        >
          <ZoomOut size={17} />
        </button>
        <button
          className="language-toggle"
          aria-label={t('切换为英文', 'Switch to Chinese')}
          onClick={() => setLanguage(language === 'zh' ? 'en' : 'zh')}
        >
          {language === 'zh' ? 'EN' : '中文'}
        </button>
      </nav>
      {!inspecting && (
        <button className="open-inspector pixel-button" onClick={() => setInspecting(true)}>
          {t('打开居民手记', 'Resident notebook')}
          <ChevronRight size={14} />
        </button>
      )}
      <div className="camera-hint" aria-live="polite">
        {t('按住地图拖动 · 滚轮缩放', 'Drag to pan · Scroll to zoom')}
        <span>
          {hud.following
            ? t(
                `跟随 ${name(hud.following)} · 拖动可解除`,
                `Following ${name(hud.following)} · drag to release`,
              )
            : t('自由镜头', 'Free camera')}
        </span>
      </div>
      <section className="observation-story paper-panel">
        <span>✦ {t('今天的小镇生活', 'TODAY IN TOWN')}</span>
        <h1>{t(scene.title, scene.titleEn)}</h1>
        <p>{t(scene.question, scene.questionEn)}</p>
        <div>
          {scene.id === 'free-day' ? (
            <>
              <small>
                {game.encounters?.length || 0} {t('次邻里交谈', 'conversations')}
              </small>
              <small>
                {Object.values(game.minds || {}).filter((m) => m.memories.length).length}{' '}
                {t('位留下经历', 'with memories')}
              </small>
            </>
          ) : scene.id === 'spring-party' ? (
            <>
              <small>
                {stats.corrected + stats.rumor} {t('位听说茶会', 'heard about it')}
              </small>
              <small>
                {game.storyProgress?.arrivals.length || 0} {t('位实际到场', 'actually arrived')}
              </small>
              <small>09:30 · {t('咖啡馆', 'Café')}</small>
            </>
          ) : (
            <>
              <small>
                {stats.corrected} {t('位有可靠线索', 'have a source')}
              </small>
              <small>
                {stats.rumor} {t('位听到传闻', 'heard a rumor')}
              </small>
              {scene.id === 'lost-cat' && (
                <small>
                  {game.storyProgress?.arrivals.length || 0} {t('位找到栗子', 'found Chestnut')}
                </small>
              )}
            </>
          )}
        </div>
        {scene.fact && (
          <details>
            <summary>{t('轻轻介入故事', 'Nudge the story')}</summary>
            <p>
              {t(
                `把${scene.id === 'spring-party' ? '邀请' : '可靠线索'}交给选中的居民，再观察变化。还可介入 ${game.remaining} 次。`,
                `Share the ${scene.id === 'spring-party' ? 'invitation' : 'first-hand source'} with a neighbor, then watch. ${game.remaining} interventions left.`,
              )}
            </p>
            <button
              className="pixel-button"
              disabled={busy || game.remaining < 1 || belief.verified}
              onClick={() => onIntervene('evidence', selected)}
            >
              {t(`分享给${name(selected)}`, `Share with ${name(selected)}`)}
            </button>
          </details>
        )}
        <button
          className="propagation-link"
          onClick={() => {
            setPlaying(false);
            setPropagationOpen(true);
          }}
        >
          <span>{t('消息是怎样传开的？', 'How did the message spread?')}</span>
          <GitBranch size={14} />
        </button>
        {guideVisible ? (
          <div className="observation-guide" aria-label={t('操作指引', 'Getting started')}>
            <div>
              <strong>
                {guideStep < 4 ? `${guideStep + 1}/4 · ` : '✓ '}
                {t('从这里开始', 'GETTING STARTED')}
              </strong>
              <button
                aria-label={t('收起操作指引', 'Hide getting started')}
                onClick={() => setGuideVisible(false)}
              >
                <X size={12} />
              </button>
            </div>
            <p>{advice[guideStep]}</p>
            <button
              className="guide-action"
              disabled={
                (guideStep === 2 && (!ready || busy || stepping || playing || finished)) ||
                (guideStep === 3 && !latest[0])
              }
              onClick={() =>
                guideStep < 2
                  ? focusResident()
                  : guideStep === 2
                    ? stepOnce()
                    : guideStep === 3
                      ? openTrace(latest[0].id)
                      : onModal('stories')
              }
            >
              {guideStep < 2
                ? t(`看看${name(scene.focus)}`, `Follow ${name(scene.focus)}`)
                : guideStep === 2
                  ? t('观察下一段', 'Next segment')
                  : guideStep === 3
                    ? t('打开最近的对话', 'Open the latest conversation')
                    : t('换个故事', 'Try another story')}{' '}
              →
            </button>
          </div>
        ) : (
          <button className="show-guide" onClick={() => setGuideVisible(true)}>
            {t('显示操作指引', 'Show getting started')}
          </button>
        )}
      </section>

      {inspecting && (
        <aside
          className="observation-inspector paper-panel"
          aria-label={t('居民手记', 'Resident notebook')}
        >
          <div className="inspector-title">
            <span>{t('居民手记', 'RESIDENT NOTEBOOK')}</span>
            <button
              aria-label={t('收起居民手记', 'Close resident notebook')}
              onClick={() => setInspecting(false)}
            >
              <X size={17} />
            </button>
          </div>
          <div className="inspector-scroll">
            <div className="inspector-person">
              <PixelPortrait id={selected} label={name(selected)} />
              <div>
                <h2>{name(selected)}</h2>
                <p>{personText(selected, 'role', language)}</p>
                <button onClick={() => worldRef.current?.follow(selected)}>
                  <Eye size={12} />
                  {t('跟随 TA', 'Follow resident')}
                </button>
              </div>
            </div>
            <div className="resident-tabs" aria-label={t('选择居民', 'Select resident')}>
              {RESIDENTS.map((p) => (
                <button
                  key={p.id}
                  title={name(p.id)}
                  aria-label={t(`查看${name(p.id)}`, `Inspect ${name(p.id)}`)}
                  className={p.id === selected ? 'active' : ''}
                  onClick={() => select(p.id)}
                >
                  <PixelPortrait id={p.id} label={name(p.id)} />
                </button>
              ))}
            </div>
            <section>
              <span className="inspector-label">{t('此刻正在', 'HAPPENING NOW')}</span>
              <p className="current-activity">
                {(language === 'en'
                  ? hud.activitiesEn?.[selected]
                  : hud.activitiesZh?.[selected]) ||
                  t('准备开始新的一天', 'Getting ready for the day')}
              </p>
              <small>{personText(selected, 'trait', language)}</small>
            </section>
            <section className="resident-perception">
              <span className="inspector-label">{t('刚刚亲眼看到', 'PERSONALLY OBSERVED')}</span>
              {mind?.memories
                .filter((memory) => memory.kind === 'observation' && memory.subjectId)
                .slice(-3)
                .map((memory) => (
                  <p key={memory.id}>{text(memory)}</p>
                ))}
              {!mind?.memories.some((memory) => memory.subjectId) && (
                <p className="empty-note">
                  {t(
                    '只记录视野内的居民和事件，不知道远处发生了什么。',
                    'Only nearby visible activity is observed. Distant events remain unknown.',
                  )}
                </p>
              )}
            </section>
            <section>
              <span className="inspector-label">
                {intent?.mode === 'ai'
                  ? t('AI 的下一步打算', 'NEXT MODEL INTENTION')
                  : t('尚未收到模型规划', 'AWAITING A MODEL PLAN')}
              </span>
              <p>{language === 'en' ? intent?.activityEn || intent?.activity : intent?.activity}</p>
              <blockquote>
                {language === 'en' ? intent?.reasonEn || intent?.reason : intent?.reason}
              </blockquote>
              {intent?.talkTo && (
                <small>
                  {t(
                    `想去找${name(intent.talkTo)}聊聊`,
                    `Wants to speak with ${name(intent.talkTo)}`,
                  )}
                </small>
              )}
            </section>
            <section>
              <details className="mind-details">
                <summary>{t('今天的日程', 'Daily schedule')}</summary>
                <ol className="daily-schedule">
                  {mind?.schedule.map((slot, index) => (
                    <li key={index}>
                      <time>{slot.time}</time>
                      <span>
                        {placeText(slot.place, language)} ·{' '}
                        {slot.kind === 'work'
                          ? t('工作与日常', 'Work & chores')
                          : slot.kind === 'meal'
                            ? t('午餐', 'Lunch')
                            : t('见面与散步', 'Meet & stroll')}
                      </span>
                      {slot.replanned && (
                        <small className="schedule-revision">
                          {t('已调整', 'Revised')} ·{' '}
                          {slot.status === 'completed'
                            ? t('已到达', 'Arrived')
                            : slot.status === 'missed'
                              ? t('未按时到达', 'Missed')
                              : t('计划中', 'Planned')}
                          <br />
                          {language === 'en' ? slot.reasonEn : slot.reason}
                        </small>
                      )}
                    </li>
                  ))}
                </ol>
                {!!mind?.planChanges?.length && (
                  <div className="schedule-change-note">
                    <strong>{t('为什么改计划？', 'Why did the plan change?')}</strong>
                    {mind.planChanges.slice(-2).map((change, index) => (
                      <div className="schedule-change-entry" key={index}>
                        {change.time} · {language === 'en' ? change.reasonEn : change.reason}
                        <small>
                          {change.mode === 'ai'
                            ? t('模型决定', 'Model decision')
                            : t('历史规则安排', 'Historical rule plan')}
                        </small>
                        <details className="schedule-evidence">
                          <summary>{t('依据的经历', 'Supporting experiences')}</summary>
                          <ul>
                            {change.evidenceIds.map((id) => (
                              <li key={id}>
                                {text(mind.memories.find((memory) => memory.id === id)) ||
                                  t('较早记录已归档', 'Earlier record archived')}
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    ))}
                  </div>
                )}
                <small>
                  {t(
                    '日程提供方向；居民可以临时改变下一步。',
                    'A daily outline; residents can choose a different next action.',
                  )}
                </small>
              </details>
            </section>
            <section>
              <span className="inspector-label">
                {t(
                  scene.id === 'free-day' ? '今天的生活目标' : '关于这件事的认知',
                  scene.id === 'free-day' ? 'DAILY GOAL' : 'BELIEF ABOUT THIS STORY',
                )}
              </span>
              <p className={`belief-label ${belief.verified ? 'verified' : ''}`}>
                {scene.id === 'free-day'
                  ? language === 'en'
                    ? intent?.reasonEn
                    : intent?.reason
                  : belief.claim === null
                    ? t('还没听说这件事', 'Has not heard about this yet')
                    : claimText(belief.claim, language, game)}
              </p>
            </section>
            <section>
              <span className="inspector-label">
                {t('实际收到的消息', 'MESSAGES ACTUALLY RECEIVED')}
              </span>
              {memories.length ? (
                memories.map((m) => (
                  <button className="memory-entry" key={m.id} onClick={() => openTrace(m.id)}>
                    <small>
                      {name(m.sender)} ·{' '}
                      {m.evidence
                        ? t('有直接来源', 'First-hand source')
                        : t('未经核实', 'Unverified')}
                    </small>
                    <p>{text(m)}</p>
                    <span>{t('查看消息来路 →', 'Trace its source →')}</span>
                  </button>
                ))
              ) : (
                <p className="empty-note">
                  {t(
                    '还没有新的消息。邻居见面后，记忆会留在这里。',
                    'No messages yet. Conversations will leave memories here.',
                  )}
                </p>
              )}
            </section>
            <section>
              <details className="mind-details">
                <summary>
                  {t('当前相关记忆', 'Relevant personal memories')}{' '}
                  <small>{retrieved.length}</small>
                </summary>
                <p className="empty-note">
                  {t(
                    '按近期程度、重要性与词语相关性检索，只读取 TA 自己的经历。',
                    'Ranked by recency, importance and word overlap, from this resident’s own experiences.',
                  )}
                </p>
                {retrieved.map((m) => (
                  <article className="recalled-memory" key={m.id}>
                    <small>
                      {t(`第 ${m.round} 段`, `Segment ${m.round}`)} ·{' '}
                      {m.kind === 'message'
                        ? t('消息', 'Message')
                        : m.kind === 'conversation'
                          ? t('邻里闲聊', 'Neighbor chat')
                          : t('亲身经历', 'Observation')}
                    </small>
                    <p>{text(m)}</p>
                  </article>
                ))}
              </details>
            </section>
            <section>
              <details className="mind-details">
                <summary>
                  {t('自己的反思', 'Personal reflections')}{' '}
                  <small>{mind?.reflections.length || 0}</small>
                </summary>
                {mind?.reflections.length ? (
                  mind.reflections
                    .slice(-3)
                    .reverse()
                    .map((r) => (
                      <article className="recalled-memory" key={r.id}>
                        <p>{text(r)}</p>
                        <small>
                          {t(
                            'AI 推断，不代表事实。依据：',
                            'Model inference, not a fact. Based on:',
                          )}
                        </small>
                        <ul>
                          {r.evidenceIds.map((id) => (
                            <li key={id}>{text(mind.memories.find((m) => m.id === id))}</li>
                          ))}
                        </ul>
                      </article>
                    ))
                ) : (
                  <p className="empty-note">
                    {t(
                      '尚无反思。连接模型后，居民可根据自己的记忆形成有依据的个人推断。',
                      'No reflections yet. A connected model can form personal inferences citing the resident’s memories.',
                    )}
                  </p>
                )}
              </details>
            </section>
          </div>
        </aside>
      )}
      <section
        className="observation-feed paper-panel"
        aria-label={t('街角正在发生', 'Around town')}
      >
        <span className="inspector-label">{t('街角正在发生', 'AROUND TOWN')}</span>
        {latest[0] ? (
          <button onClick={() => openTrace(latest[0].id)}>
            <strong>
              {name(latest[0].sender)} → {name(latest[0].receiver)}
            </strong>
            <p>{text(latest[0])}</p>
          </button>
        ) : (
          <p>
            {t(
              '咖啡香飘过街角，居民们还在忙自己的事。',
              'Coffee scents the street as neighbors go about their day.',
            )}
          </p>
        )}
      </section>
      <footer className="observation-controls wood-panel">
        <button
          className="observe-play pixel-button"
          disabled={!ready || finished || stepping}
          onClick={() => setPlaying((value) => !value)}
        >
          {playing ? <Pause size={18} /> : <Play size={18} />}
          <span>
            {!ready
              ? t('准备小镇…', 'Preparing…')
              : playing
                ? t('暂停观察', 'Pause')
                : game.round === 0
                  ? t('开始观察', 'Start observing')
                  : t('继续观察', 'Resume')}
          </span>
        </button>
        <button
          className="observe-step"
          disabled={!ready || busy || stepping || playing || finished}
          onClick={stepOnce}
        >
          <SkipForward size={17} />
          <span>{t('观察下一段', 'Next segment')}</span>
        </button>
        <div className="observation-speed" aria-label={t('观察速度', 'Observation speed')}>
          {[1, 2, 4].map((value) => (
            <button
              key={value}
              aria-label={t(`${value}倍速度`, `${value}× speed`)}
              className={speed === value ? 'active' : ''}
              onClick={() => setSpeed(value)}
            >
              {value}×
            </button>
          ))}
        </div>
        <span className="observation-phase" role="status">
          {busy
            ? t('居民正在思考…', 'Residents are thinking…')
            : hud.speeches?.length && !propagationOpen
              ? paused
                ? t('已暂停 · 点对话气泡看全文', 'Paused · select a dialogue bubble to read')
                : t(
                    '居民正在交谈 · 点气泡看全文',
                    'Neighbors are talking · select a bubble to read',
                  )
              : finished
                ? t('今天的观察已结束', 'Observation complete')
                : hud.meeting && !paused
                  ? t(
                      `正在赶路 · ${hud.meeting.arrived}/${hud.meeting.total} 组已相遇`,
                      `Walking to meet · ${hud.meeting.arrived}/${hud.meeting.total} pairs together`,
                    )
                  : stepping
                    ? t('正在完成这一段生活', 'Completing this segment')
                    : paused
                      ? t('已暂停 · 拖动地图或点居民', 'Paused · drag the map or select a neighbor')
                      : t('居民自由活动中', 'Residents are out and about')}
        </span>
        <button
          aria-label={t('导出观察记录', 'Export observation')}
          title={t('导出观察记录', 'Export observation')}
          onClick={onExport}
        >
          <Download size={17} />
        </button>
      </footer>
      {propagationOpen && (
        <PropagationView
          game={game}
          onClose={() => setPropagationOpen(false)}
          onLocate={(id) => {
            setPropagationOpen(false);
            select(id, true);
          }}
          onStep={stepOnce}
          onIntervene={(id) => onIntervene('evidence', id)}
          canStep={ready && !busy && !stepping && !playing && !finished}
          busy={busy}
          stepping={stepping}
          meeting={hud.meeting}
          speed={speed}
          onSpeed={setSpeed}
        />
      )}
      {storageFailed && (
        <div className="pixel-hint">
          {t(
            '浏览器无法保存进度，仍可继续观察。',
            'Browser saving is unavailable. You can continue observing.',
          )}
        </div>
      )}
      {hint && (
        <div className="pixel-hint" role="status">
          {hint}
        </div>
      )}
      {roster && (
        <Dialog
          title={t('今天，也和邻居们见个面', 'Meet your 25 neighbors')}
          onClose={() => setRoster(false)}
        >
          <label className="roster-search">
            {t('寻找邻居', 'Find a neighbor')}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('按名字或职业搜索…', 'Search names or occupations…')}
            />
          </label>
          <div className="observe-roster">
            {rosterPeople.map((p) => (
              <button key={p.id} onClick={() => select(p.id, true)}>
                <PixelPortrait id={p.id} label={name(p.id)} />
                <strong>{name(p.id)}</strong>
                <small>{personText(p.id, 'role', language)}</small>
                <span>{t('跟随观察 →', 'Follow →')}</span>
              </button>
            ))}
          </div>
          {!rosterPeople.length && <p>{t('没有匹配的居民。', 'No matching residents.')}</p>}
        </Dialog>
      )}
      {trace && (
        <Dialog
          title={t('这一句话，从哪里来？', 'Where did this story come from?')}
          onClose={() => setTrace(null)}
        >
          {!!conversationTurns.length && (
            <section className="conversation-transcript">
              <span className="inspector-label">
                {t('这次相遇的完整对话', 'FULL CONVERSATION')}
              </span>
              {conversationTurns.map((message) => (
                <article
                  key={message.id}
                  className={
                    message.sender === conversationTurns[0].sender ? 'speaker-a' : 'speaker-b'
                  }
                >
                  <strong>
                    {name(message.sender)} → {name(message.receiver)}{' '}
                    <small>
                      {message.dialogue.turn + 1}/{message.dialogue.total}
                    </small>
                  </strong>
                  <p>{text(message)}</p>
                  <small>
                    {message.mode === 'ai' ? 'API' : t('规则演示', 'Rule-based demo')} ·{' '}
                    {message.kind === 'chat'
                      ? t('交流 / 回应', 'Chat / response')
                      : t('有来源的转述', 'Source-linked retelling')}
                  </small>
                </article>
              ))}
            </section>
          )}
          <div className="observe-trace">
            {traceItems.map((m) => (
              <article key={m.id}>
                <span>
                  {name(m.sender)} → {name(m.receiver)} ·{' '}
                  {t(`第 ${m.round} 段`, `Segment ${m.round}`)}
                </span>
                <p>{text(m)}</p>
                <small>
                  {m.kind === 'chat'
                    ? t('日常闲聊', 'Everyday conversation')
                    : m.evidence
                      ? t('直接来源', 'First-hand source')
                      : t('尚未核实', 'Unverified')}{' '}
                  ·{' '}
                  {m.mode === 'ai'
                    ? t('AI 对话', 'Model dialogue')
                    : m.mode === 'scenario'
                      ? t('场景初始信息', 'Scenario initial information')
                      : m.mode === 'intervention'
                        ? t('用户提供的线索', 'User-provided clue')
                        : t('历史规则记录', 'Historical rule record')}
                </small>
              </article>
            ))}
          </div>
        </Dialog>
      )}
    </main>
  );
}
