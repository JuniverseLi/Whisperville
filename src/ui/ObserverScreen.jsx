import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pause,
  Play,
  ShieldCheck,
  SkipForward,
} from 'lucide-react';
import { CLAIMS, RESIDENTS, residentById } from '../simulation/scenario.js';
import { isFinished, planTurn, getStats } from '../simulation/engine.js';
import { createVillage, describeActivity, planActivities, PLACES } from '../simulation/village.js';
import TownMap from './TownMap.jsx';
import Network from './Network.jsx';
import Portrait from './Portrait.jsx';

const clock = (round, progress = 0) => {
  const minutes = 540 + round * 20 + Math.floor(progress * 20);
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
};

export default function ObserverScreen({
  game,
  selected,
  onSelect,
  view,
  onView,
  showPaths,
  onShowPaths,
  busy,
  mode,
  checkpoint,
  onAdvance,
  onIntervene,
  onTrace,
  onSaveCheckpoint,
  onModal,
  onExport,
  storageFailed,
}) {
  const [playing, setPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(game.round > 0);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [inspected, setInspected] = useState(false);
  const elapsed = useRef(0);
  const advancing = useRef(false);
  const finished = isFinished(game);
  const contacts = useMemo(() => planTurn(game), [game]);
  const activities = useMemo(() => planActivities(game, contacts), [game, contacts]);
  const motion = { activities, progress, active: playing, started: hasStarted, mode };
  const resident = residentById(selected);
  const task = activities[selected];
  const state = game.residents[selected];
  const currentVillage = game.village || createVillage();
  const messages = game.messages.filter(
    (message) => message.receiver === selected || message.sender === selected,
  );
  const latestChat = messages.filter((message) => residentById(message.sender)).at(-1);
  const memories = game.messages
    .filter((message) => message.receiver === selected)
    .slice(-3)
    .reverse();
  const stats = getStats(game);
  const phaseText = !hasStarted
    ? `在${PLACES[currentVillage[selected].place].name}`
    : finished
      ? '这段观察已结束'
      : describeActivity(task, progress);

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    elapsed.current = 0;
    setHasStarted(game.round > 0);
  }, [game.id]);
  useEffect(() => {
    if (finished) setPlaying(false);
  }, [finished]);
  useEffect(() => {
    const pauseWhenHidden = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);
  useEffect(() => {
    if (!playing || busy || finished) return;
    let last = performance.now();
    const timer = setInterval(() => {
      if (advancing.current) return;
      const now = performance.now();
      elapsed.current = Math.min(1, elapsed.current + ((now - last) * speed) / 10000);
      last = now;
      setProgress(elapsed.current);
      if (elapsed.current >= 1) {
        advancing.current = true;
        clearInterval(timer);
        Promise.resolve(onAdvance({ quiet: true })).finally(() => {
          elapsed.current = 0;
          setProgress(0);
          advancing.current = false;
        });
      }
    }, 50);
    return () => clearInterval(timer);
  }, [playing, busy, finished, speed, onAdvance]);

  function select(id) {
    onSelect(id);
    setInspected(true);
  }
  function openModal(name) {
    setPlaying(false);
    onModal(name);
  }
  function menuAction(event, action) {
    event.currentTarget.closest('details').open = false;
    setPlaying(false);
    action();
  }
  function step() {
    if (busy || advancing.current || finished) return;
    setPlaying(false);
    setHasStarted(true);
    elapsed.current = 0;
    setProgress(0);
    onAdvance({ quiet: true });
  }

  return (
    <div className="observer-app">
      <header className="observer-header">
        <div className="observer-brand">
          <strong>Whisperville</strong>
          <span>小镇观察室</span>
        </div>
        <div className="observer-clock">
          <span>星期一</span>
          <strong>{clock(game.round, progress)}</strong>
          <small>第 {game.round} / 12 段</small>
        </div>
        <div className="observer-tools">
          <span className="observer-mode">{mode === 'ai' ? 'AI 对话' : '规则演示'}</span>
          <button onClick={() => openModal('help')} aria-label="怎么玩">
            <CircleHelp size={16} />
            <span>怎么玩</span>
          </button>
          <details className="observer-menu">
            <summary aria-label="更多功能">
              <MoreHorizontal size={21} />
            </summary>
            <div>
              <button onClick={(event) => menuAction(event, () => openModal('cast'))}>
                认识八位居民
              </button>
              <button
                onClick={(event) =>
                  menuAction(event, () => onView(view === 'town' ? 'network' : 'town'))
                }
              >
                {view === 'town' ? '查看传播关系' : '返回小镇'}
              </button>
              <button onClick={(event) => menuAction(event, onSaveCheckpoint)} disabled={busy}>
                保存观察节点
              </button>
              {checkpoint && (
                <button onClick={(event) => menuAction(event, () => openModal('restore'))}>
                  返回观察节点
                </button>
              )}
              <button onClick={(event) => menuAction(event, onExport)}>导出观察记录</button>
              <button onClick={(event) => menuAction(event, () => openModal('settings'))}>
                模型设置
              </button>
              <button
                onClick={(event) => menuAction(event, () => openModal('restart'))}
                disabled={busy}
              >
                从头观察
              </button>
            </div>
          </details>
        </div>
      </header>
      <div className="observer-introduction">
        <div>
          <span className="observer-chapter">今天的话题</span>
          <h1>“听说明天学校可能停课。”</h1>
          <p>这句话刚传到咖啡店。看看谁会听到它，又会怎么告诉下一个人。</p>
        </div>
        <div className="observer-steps">
          <span className={hasStarted ? 'done' : 'current'}>
            <i>{hasStarted ? <Check size={12} /> : '1'}</i>开始观察
          </span>
          <ArrowRight size={13} />
          <span className={inspected ? 'done' : hasStarted ? 'current' : ''}>
            <i>{inspected ? <Check size={12} /> : '2'}</i>点击一位居民
          </span>
          <ArrowRight size={13} />
          <span>
            <i>3</i>看行动与对话
          </span>
        </div>
      </div>
      <main className="observer-main">
        <section className="observer-map-column">
          <div className="observer-map-title">
            <span>
              <MapPin size={15} />
              耳语镇 · 河畔街区
            </span>
            <span>
              {playing
                ? busy
                  ? '正在完成这次对话…'
                  : '居民正在行动'
                : finished
                  ? '本段观察结束'
                  : '画面已暂停'}
            </span>
          </div>
          <div className="observer-world">
            {view === 'town' ? (
              <TownMap
                game={game}
                selected={selected}
                onSelect={select}
                showPaths={showPaths}
                motion={motion}
                simple
              />
            ) : (
              <>
                <Network game={game} selected={selected} onSelect={select} />
                <button className="observer-back" onClick={() => onView('town')}>
                  返回小镇
                </button>
              </>
            )}
            {!hasStarted && (
              <div className="observer-start-note">
                <Play size={19} />
                <div>
                  <strong>先看看小镇自己会发生什么</strong>
                  <p>
                    点击下方「开始观察」。你可以随时暂停，
                    <br />
                    点一位居民查看他正在做的事。
                  </p>
                </div>
              </div>
            )}
          </div>
          <div className="observer-playback">
            <button
              className="observer-play"
              onClick={() => {
                if (finished) {
                  openModal('result');
                  return;
                }
                setHasStarted(true);
                setPlaying(!playing);
              }}
              aria-label={
                finished
                  ? '查看观察小结'
                  : playing
                    ? '暂停观察'
                    : hasStarted
                      ? '继续观察'
                      : '开始观察'
              }
            >
              {playing ? <Pause size={18} /> : <Play size={18} fill="currentColor" />}
              {finished ? '查看小结' : playing ? '暂停观察' : hasStarted ? '继续观察' : '开始观察'}
            </button>
            <button className="observer-step" onClick={step} disabled={busy || finished}>
              <SkipForward size={16} />
              下一段
            </button>
            <label className="observer-speed">
              速度
              <select
                aria-label="观察速度"
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              >
                <option value={1}>1×</option>
                <option value={2}>2×</option>
                <option value={4}>4×</option>
              </select>
            </label>
            <div className="observer-segment">
              <span>
                {busy
                  ? '正在生成本次对话，完成后继续'
                  : playing
                    ? progress < 0.72
                      ? '居民在路上，见面后会交谈'
                      : '居民见面了，正在交流消息'
                    : '每段约 10 秒，对应小镇的 20 分钟'}
              </span>
              <div>
                <i style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          </div>
          <div className="observer-residents" aria-label="选择观察的居民">
            {RESIDENTS.map((person) => (
              <button
                key={person.id}
                className={selected === person.id ? 'active' : ''}
                onClick={() => select(person.id)}
                aria-label={`观察${person.name}`}
                aria-pressed={selected === person.id}
              >
                <Portrait resident={person} size={35} />
                <span>
                  <strong>{person.name}</strong>
                  <small>{person.role}</small>
                </span>
              </button>
            ))}
          </div>
        </section>
        <aside className="observer-person">
          <div className="observer-person-title">
            <span>正在观察</span>
            <span>点击地图可切换居民</span>
          </div>
          <div className="observer-person-header">
            <Portrait resident={resident} size={66} />
            <div>
              <h2>{resident.name}</h2>
              <span>{resident.role}</span>
              <p>{resident.trait}</p>
            </div>
          </div>
          <section className="observer-now">
            <span className="observer-section-label">现在在做什么</span>
            <strong>{phaseText}</strong>
            <span className="observer-location">
              <MapPin size={13} />
              {progress >= 0.72
                ? PLACES[task.place].name
                : PLACES[currentVillage[selected].place].name}
            </span>
            <div className="observer-next">
              <span>接下来</span>
              <p>
                {finished
                  ? '这段故事已经结束，可以重新观察。'
                  : task.partner
                    ? `和${residentById(task.partner).name}聊学校的消息`
                    : task.action}
              </p>
            </div>
          </section>
          <section className="observer-conversation">
            <h3>
              <MessageCircle size={16} />
              最近一次对话
            </h3>
            {latestChat ? (
              <button
                onClick={() => {
                  setPlaying(false);
                  onTrace(latestChat.id);
                }}
                className="observer-chat-record"
              >
                <span>
                  {residentById(latestChat.sender).name} → {residentById(latestChat.receiver).name}
                  <time>{clock(latestChat.round)}</time>
                </span>
                <p>{latestChat.text}</p>
                <small>
                  查看这句话的来处
                  <ArrowRight size={12} />
                </small>
              </button>
            ) : (
              <div className="observer-empty">
                <p>还没有发生对话。</p>
                <span>
                  {hasStarted
                    ? '到达目的地后，完整对话会显示在这里。'
                    : '开始观察后，居民会走到邻居身边，再聊起这条消息。'}
                </span>
              </div>
            )}
          </section>
          <section className="observer-memory">
            <h3>
              <BookOpen size={16} />
              TA 记得的消息
            </h3>
            {memories.length ? (
              memories.map((message) => (
                <button
                  key={message.id}
                  onClick={() => {
                    setPlaying(false);
                    onTrace(message.id);
                  }}
                >
                  <span>
                    {message.evidence ? '看过官方公告' : '收到邻里的消息'}
                    <time>{clock(message.round)}</time>
                  </span>
                  <p>{message.text}</p>
                </button>
              ))
            ) : (
              <p className="observer-empty-memory">还没听说学校的消息。</p>
            )}
          </section>
          <details
            className="observer-experiment"
            onToggle={(event) => {
              if (event.currentTarget.open) setPlaying(false);
            }}
          >
            <summary>
              <ShieldCheck size={16} />
              <span>试着改变接下来的故事</span>
              <ChevronDown size={15} />
            </summary>
            <div>
              <p>
                你已经知道真实情况：<strong>学校明天正常上课，只关闭操场。</strong>
              </p>
              <p>给{resident.name}看公告，再继续观察，看看 TA 是否会把事实告诉别人。</p>
              <button
                className="primary-button"
                disabled={busy || finished || !game.remaining || state.verified}
                onClick={() => {
                  if (progress > 0) {
                    step();
                    return;
                  }
                  setPlaying(false);
                  onIntervene('evidence');
                }}
              >
                <ShieldCheck size={16} />
                {state.verified
                  ? 'TA 已经看过官方公告'
                  : progress > 0
                    ? '先看完这一段'
                    : `给${resident.name}看公告`}
              </button>
              <span>可选操作 · 还可以使用 {game.remaining} 次</span>
              <button className="observer-read-notice" onClick={() => openModal('evidence')}>
                先读一读原始公告
                <ArrowRight size={12} />
              </button>
            </div>
          </details>
          {finished && (
            <div className="observer-finish">
              <strong>这段观察结束了</strong>
              <p>
                {stats.corrected} 位居民看过证据，{stats.rumor}{' '}
                位仍相信流言。可以从头观察，试试不同的选择。
              </p>
            </div>
          )}
        </aside>
      </main>
      <footer className="observer-footer">
        <span>你可以只观察，不需要完成任务。</span>
        <span>{storageFailed ? '浏览器无法保存，请从更多菜单导出记录' : '已自动保存观察进度'}</span>
        <details>
          <summary>显示选项</summary>
          <label>
            <input
              type="checkbox"
              checked={showPaths}
              onChange={(event) => onShowPaths(event.target.checked)}
            />
            显示消息传播线
          </label>
        </details>
      </footer>
    </div>
  );
}
