import ModelStudy from './ModelStudy.jsx';
import ExperimentLab from './ExperimentLab.jsx';
import StoryChooser from './StoryChooser.jsx';
import { getScenario } from '../simulation/scenarios.js';
import { useEffect, useRef, useState } from 'react';
import { Leaf, X, RotateCcw, FlaskConical } from 'lucide-react';
import { intervene, isFinished, validateGame, planTurn } from '../simulation/engine.js';
import { validIntentions, lifeContext } from '../simulation/life.js';
import { getModelStatus, requestDialogue } from '../agents/client.js';
import TownObserver from './TownObserver.jsx';
import Dialog from './Dialog.jsx';
import ApiSettings from './ApiSettings.jsx';
import { useLanguage } from './Language.jsx';
import { updateMinds, validMinds } from '../simulation/memory.js';
import { COGNITION_VERSION } from '../simulation/day-plan.js';
import { createLiveGame, commitLiveTurn } from '../simulation/live.js';

const STORAGE_KEY = 'whisperville.live-observation.v1';
const newGame = createLiveGame;
function loadGame() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      saved?.executionMode === 'live' &&
      saved?.observer &&
      validateGame(saved) &&
      validIntentions(saved.intentions) &&
      validMinds(saved.minds, saved)
    )
      return { ...saved, cognitionVersion: COGNITION_VERSION };
  } catch {
    /* Storage is optional. */
  }
  return newGame();
}
export default function App() {
  const { language, t } = useLanguage();
  const [labReport, setLabReport] = useState(null);
  const [game, setGame] = useState(loadGame),
    gameRef = useRef(game);
  gameRef.current = game;
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false),
    abortRef = useRef(null);
  const [modal, setModal] = useState(() => {
      try {
        return localStorage.getItem('whisperville.welcome.v1') ? null : 'welcome';
      } catch {
        return 'welcome';
      }
    }),
    [notice, setNotice] = useState(''),
    [storageFailed, setStorageFailed] = useState(false);
  const [modelStatus, setModelStatus] = useState({ mode: 'checking', model: null });
  const [advanceError, setAdvanceError] = useState(null);
  const [auditReport, setAuditReport] = useState(null);
  const mode = modelStatus.mode === 'ai' ? 'ai' : 'unconfigured';
  useEffect(() => {
    const controller = new AbortController();
    getModelStatus(controller.signal)
      .then(setModelStatus)
      .catch(() => {});
    return () => {
      controller.abort();
      abortRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } catch {
      setStorageFailed(true);
    }
  }, [game]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function nextTurn(snapshot) {
    const base = { ...gameRef.current, language };
    if (busyRef.current || isFinished(base)) return;
    setAdvanceError(null);
    busyRef.current = true;
    setBusy(true);
    try {
      if (mode !== 'ai')
        throw new Error(t('请先在设置中连接真实 API。', 'Connect a real API in Settings first.'));
      const requiredCalls = planTurn(base, base.intentions).length ? 4 : 1;
      if (base.apiBudget && base.apiBudget.remaining < requiredCalls)
        throw new Error(
          t(
            '剩余额度不足，观察已暂停。请调整额度或开始新一天。',
            'Insufficient request budget. Observation paused. Update the limit or start a new day.',
          ),
        );
      abortRef.current = new AbortController();
      const result = await requestDialogue(
        base,
        abortRef.current.signal,
        lifeContext(base, snapshot),
        snapshot,
      );
      if (gameRef.current.id === base.id) setGame(commitLiveTurn(base, result, snapshot));
    } catch (error) {
      if (error.name !== 'AbortError' && gameRef.current.id === base.id) {
        setAdvanceError({ message: error.message, auditId: error.auditId || null });
        if (error.budget)
          setGame({
            ...gameRef.current,
            apiBudget: error.budget,
            failedAuditIds: [
              ...(gameRef.current.failedAuditIds || []),
              ...(error.auditId ? [error.auditId] : []),
            ],
          });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function openAudit(id = game.auditIds?.at(-1) || advanceError?.auditId) {
    try {
      const response = await fetch(`/api/observations/${id || 'latest'}`);
      if (!response.ok) throw new Error('Audit unavailable');
      setAuditReport(await response.json());
      setModal('audit');
    } catch {
      setNotice(t('暂时无法读取审计记录。', 'Could not read the audit record.'));
    }
  }
  function downloadAudit() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(auditReport, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `whisperville-live-${auditReport.id}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function intervention(type, id) {
    if (busyRef.current) return;
    const next = intervene(gameRef.current, id, type);
    if (next !== gameRef.current) {
      for (const message of next.messages.slice(gameRef.current.messages.length))
        message.mode = 'intervention';
      next.minds = updateMinds(gameRef.current, next);
      setGame(next);
      setNotice(
        t(
          '可靠的消息已经交给居民，看看接下来会发生什么。',
          'The resident has the first-hand source. Watch what happens next.',
        ),
      );
    }
  }
  function restart() {
    abortRef.current?.abort();
    setAdvanceError(null);
    const next = newGame(gameRef.current.seed, getScenario(gameRef.current).id);
    gameRef.current = next;
    setGame(next);
    setModal(null);
  }
  function closeWelcome() {
    try {
      localStorage.setItem('whisperville.welcome.v1', 'seen');
    } catch {
      /* Optional preference. */
    }
    setModal(null);
  }
  function chooseStory(id) {
    if (busyRef.current) return;
    if (id !== getScenario(gameRef.current).id) {
      setAdvanceError(null);
      const next = newGame(gameRef.current.seed, id);
      gameRef.current = next;
      setGame(next);
    }
    closeWelcome();
  }
  async function exportRun() {
    const ids = [...(game.auditIds || []), ...(game.failedAuditIds || [])];
    let observations;
    try {
      observations = await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/observations/${id}`);
          if (!response.ok) throw new Error('Missing audit');
          return response.json();
        }),
      );
    } catch {
      setNotice(
        t(
          '审计记录不完整，未导出。请检查本机记录目录。',
          'Audit records are incomplete; export stopped. Check local storage.',
        ),
      );
      return;
    }
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              version: 'live-town-run-v1',
              exportedAt: new Date().toISOString(),
              game,
              observations,
            },
            null,
            2,
          ),
        ],
        {
          type: 'application/json',
        },
      ),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = 'whisperville-observation.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <>
      <TownObserver
        key={game.id}
        game={game}
        busy={busy}
        configuredMode={mode}
        onAdvance={nextTurn}
        onIntervene={intervention}
        onModal={setModal}
        modalOpen={Boolean(modal)}
        onExport={exportRun}
        storageFailed={storageFailed}
        advanceError={advanceError}
        onAudit={openAudit}
        onClearError={() => setAdvanceError(null)}
      />
      {notice && (
        <div className="toast" role="status">
          <Leaf size={16} />
          <span>{notice}</span>
          <button aria-label={t('关闭提示', 'Dismiss notification')} onClick={() => setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {['welcome', 'stories'].includes(modal) && (
        <StoryChooser
          game={game}
          firstVisit={modal === 'welcome'}
          busy={busy}
          onChoose={chooseStory}
          onClose={closeWelcome}
        />
      )}
      {modal === 'help' && (
        <Dialog
          title={t('看一座小镇，过自己的日子', 'Watch a town live its day')}
          onClose={() => setModal(null)}
        >
          <ol className="help-steps">
            <li>
              <span>01</span>
              <div>
                <h3>{t('开始观察', 'Start observing')}</h3>
                <p>
                  {t(
                    '25 位居民会工作、散步、见面交谈。你是观察者；暂停、倍速或逐段查看，不需要操控角色。',
                    '25 residents work, stroll and meet to talk. Pause, speed up or step through a segment. You are the observer.',
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <h3>{t('认识一个人', 'Get to know a resident')}</h3>
                <p>
                  {t(
                    '先点「传播图谱」：时间轴显示哪一段发生了什么，卡片箭头对应真实来源。点击卡片，比较接收前后认知；也可以返回小镇跟随居民。',
                    'Open Propagation: the timeline shows what happened when, and arrows follow actual source records. Select a card to compare beliefs before and after receipt, or return to town to follow the resident.',
                  )}
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <h3>{t('轻轻介入故事', 'Nudge the story')}</h3>
                <p>
                  {t(
                    '故事按钮可切换茶会、找猫、学校传闻或自由生活。左侧可以把邀请或可靠线索交给选中的居民，再观察变化。API 设置会启用基于记忆的模型决策。',
                    'Use Stories to choose a tea party, missing cat, school rumor or free day. Share an invitation or a first-hand clue in the left panel, then observe the changes. API settings enable memory-informed model decisions.',
                  )}
                </p>
              </div>
            </li>
          </ol>
          <div className="info-box">
            {t(
              '按住地图拖动 · 滚轮缩放 · M 全图 · V 房屋透视 · 方向键移动镜头 · 空格播放／暂停。本项目参考 Generative Agents，采用简化的日程、记忆检索与反思机制。未配置模型或请求失败时暂停观察。',
              'Drag the map · Wheel to zoom · M map · V roofs/interiors · Arrow keys move the camera · Space play/pause. Inspired by Generative Agents, with simplified schedules, memory retrieval and reflections. Observation pauses when no model is configured or a request fails.',
            )}
          </div>
        </Dialog>
      )}
      {modal === 'audit' && auditReport && (
        <Dialog title={t('真实 API 审计记录', 'Real API audit')} onClose={() => setModal(null)}>
          <p>
            {auditReport.model} · {auditReport.status} · {auditReport.calls.length}{' '}
            {t('次真实请求', 'actual requests')}
          </p>
          <p>
            {t('回放核验', 'Replay verification')}：
            {auditReport.replayVerified ? t('通过', 'Passed') : t('未完成', 'Incomplete')}
          </p>
          <div className="observe-trace">
            {auditReport.calls.map((call) => (
              <article key={call.index}>
                <strong>
                  {call.residentId} · {call.status}
                </strong>
                <p>
                  {call.response?.content || call.errorCode || t('等待返回', 'Awaiting response')}
                </p>
                <small>
                  {call.durationMs ?? '—'} ms · {call.response?.usage?.total_tokens ?? '—'} tokens
                </small>
              </article>
            ))}
          </div>
          <div className="dialog-actions">
            <button className="pixel-button" onClick={downloadAudit}>
              {t('导出完整原始记录', 'Export full raw audit')}
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'experiment' && (
        <ExperimentLab
          report={labReport}
          onReport={setLabReport}
          onClose={() => setModal(null)}
          onLive={() => setModal('model-study')}
        />
      )}
      {modal === 'model-study' && (
        <ModelStudy onClose={() => setModal(null)} onRules={() => setModal('experiment')} />
      )}
      {modal === 'settings' && (
        <Dialog title={t('小镇设置', 'Town settings')} onClose={() => setModal(null)}>
          <div className="settings-status">
            <Leaf size={24} />
            <div>
              <h3>
                {modelStatus.mode === 'ai'
                  ? t('行动模型已配置', 'Action model configured')
                  : t('等待连接真实 API', 'Waiting for a real API')}
              </h3>
              <p>
                {modelStatus.model ||
                  t(
                    '配置后才能启动居民决策。',
                    'Configure a provider before starting resident decisions.',
                  )}
              </p>
            </div>
          </div>
          <button className="research-entry" onClick={() => openAudit()}>
            <FlaskConical size={23} />
            <span>
              <strong>{t('真实小镇调用记录', 'Live town request records')}</strong>
              <small>
                {t(
                  '独立请求 · 原始响应 · 用量与回放核验',
                  'Private requests · Raw responses · Usage & replay',
                )}
              </small>
            </span>
            <span>→</span>
          </button>
          <ApiSettings
            busy={busy}
            onSaved={(status) => {
              setModelStatus(status);
              setAdvanceError(null);
              if (game.apiBudget)
                setGame({
                  ...game,
                  apiBudget: {
                    ...game.apiBudget,
                    limit: Math.max(status.maxCalls, game.apiBudget.used),
                    remaining: Math.max(0, status.maxCalls - game.apiBudget.used),
                  },
                });
            }}
          />
          <div className="dialog-actions">
            <button className="secondary-button" onClick={exportRun}>
              {t('导出观察记录', 'Export observation')}
            </button>
            <button
              className="secondary-button"
              disabled={busy}
              onClick={() => setModal('restart')}
            >
              <RotateCcw size={14} />
              {t('从头观察', 'Start a new day')}
            </button>
          </div>
        </Dialog>
      )}
      {modal === 'restart' && (
        <Dialog
          title={t('再观察一个新的清晨？', 'Observe a new morning?')}
          onClose={() => setModal(null)}
        >
          <p className="dialog-lead">
            {t(
              '当前居民记忆和观察进度会重置。可以先导出记录。',
              'This resets resident memories and progress. You can export the current observation first.',
            )}
          </p>
          <div className="dialog-actions">
            <button className="secondary-button" onClick={() => setModal(null)}>
              {t('继续这一天', 'Keep this day')}
            </button>
            <button className="primary-button" onClick={restart}>
              {t('从头观察', 'Start a new day')}
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
