import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Map,
  Sun,
  Settings2,
  HelpCircle,
  Users,
  X,
  ChevronRight,
  MessageCircle,
  ScrollText,
  RotateCcw,
  Download,
  Check,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ZoomIn,
  ZoomOut,
  House,
} from 'lucide-react';
import { RESIDENTS, residentById } from '../simulation/scenario.js';
import { getStats } from '../simulation/engine.js';
import { createPixelWorld } from '../game/world.js';
import { createPlayer, validPlayer, currentQuest } from '../game/session.js';
import { replyToPlayer } from '../game/dialogue.js';
import Dialog from './Dialog.jsx';

const PLAYER_KEY = 'whisperville.pixel.player.v1';
function loadPlayer(id) {
  try {
    const saved = JSON.parse(localStorage.getItem(PLAYER_KEY));
    if (validPlayer(saved, id)) return saved;
  } catch {
    /* A save is optional. */
  }
  return createPlayer(id);
}
export function PixelPortrait({ id, className = '' }) {
  return (
    <span
      role="img"
      aria-label={id === 'player' ? '你的像素角色' : residentById(id)?.name}
      className={`pixel-portrait ${className}`}
      style={{ backgroundImage: `url(/pixel/characters/${id}.png)` }}
    />
  );
}

export default function PixelGame(props) {
  return <PixelSession key={props.game.id} {...props} />;
}
function PixelSession({
  game,
  onSelect,
  onAdvance,
  onIntervene,
  onModal,
  modalOpen,
  busy,
  mode,
  onExport,
  storageFailed,
}) {
  const [player, setPlayer] = useState(() => loadPlayer(game.id));
  const playerRef = useRef(player);
  const [hud, setHud] = useState({ location: '河畔街区', loaded: 0, activities: {}, actors: {} });
  const [dialogue, setDialogue] = useState(null);
  const [panel, setPanel] = useState(null);
  const [hint, setHint] = useState('');
  const [ready, setReady] = useState(false);
  const canvasRef = useRef(null),
    worldRef = useRef(null),
    stateRef = useRef(null),
    pendingGoal = useRef(null);
  const quest = currentQuest(player),
    stats = getStats(game);
  const blocked = !player.introSeen || Boolean(dialogue || panel || modalOpen);
  stateRef.current = { game, player, busy, blocked, quest, dialogNpc: dialogue?.id };
  const handlersRef = useRef(null);

  function persist(next) {
    try {
      localStorage.setItem(PLAYER_KEY, JSON.stringify(next));
    } catch {
      setHint('浏览器没有保存权限，当前仍可游玩。');
    }
  }
  function updatePlayer(change) {
    const next = { ...playerRef.current, ...change };
    playerRef.current = next;
    setPlayer(next);
    persist(next);
  }
  function applyReply(id, topic) {
    const reply = replyToPlayer(game, id, topic, playerRef.current, hud.activities[id]);
    if (reply.intervene && busy) {
      setHint('邻居们正在交谈，稍等片刻再出示公告。');
      return;
    }
    const previous = playerRef.current;
    const change = {};
    if (reply.visited) change.visited = [...new Set([...previous.visited, reply.visited])];
    if (reply.talkedLin) change.talkedLin = true;
    if (reply.hasNotice) change.hasNotice = true;
    if (reply.shared) change.shared = [...new Set([...previous.shared, reply.shared])];
    if (reply.journal && !previous.journal.some((entry) => entry.text === reply.journal))
      change.journal = [
        ...previous.journal,
        { id: `${Date.now()}-${id}`, text: reply.journal },
      ].slice(-40);
    if (Object.keys(change).length) updatePlayer(change);
    if (reply.intervene) onIntervene('evidence', id);
    setDialogue({ id, text: reply.text, topic });
  }
  function openDialogue(id) {
    onSelect(id);
    applyReply(id, 'greet');
  }
  handlersRef.current = {
    openDialogue,
    onAdvance,
    onSnapshot(snapshot) {
      setHud(snapshot);
      const next = { ...playerRef.current, x: snapshot.x, y: snapshot.y };
      playerRef.current = next;
      // Position is saved without re-rendering the entire interface every frame.
      try {
        localStorage.setItem(PLAYER_KEY, JSON.stringify(next));
      } catch {
        /* Session remains playable. */
      }
    },
  };
  useEffect(() => {
    const world = createPixelWorld(canvasRef.current, {
      getState: () => stateRef.current,
      onInteract: (id) => handlersRef.current.openDialogue(id),
      onSnapshot: (snapshot) => handlersRef.current.onSnapshot(snapshot),
      onConversation: () => handlersRef.current.onAdvance({ quiet: true }),
      onHint: setHint,
      onReady: () => setReady(true),
    });
    worldRef.current = world;
    return () => {
      world.dispose();
      worldRef.current = null;
      persist(playerRef.current);
    };
  }, []);
  useEffect(() => {
    if (!blocked && pendingGoal.current) {
      const id = pendingGoal.current;
      pendingGoal.current = null;
      worldRef.current?.goToNpc(id);
    }
  }, [blocked, panel, dialogue]);
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(''), 5000);
    return () => clearTimeout(timer);
  }, [hint]);
  useEffect(() => {
    const close = (event) => {
      if (event.key === 'Escape') {
        setDialogue(null);
        setPanel(null);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, []);
  function visit(id) {
    if (blocked) {
      pendingGoal.current = id;
      setPanel(null);
      setDialogue(null);
    } else worldRef.current?.goToNpc(id);
  }
  const resident = dialogue && residentById(dialogue.id);
  const clock = `${String(9 + Math.floor((game.round * 10) / 60)).padStart(2, '0')}:${String((game.round * 10) % 60).padStart(2, '0')}`;

  return (
    <main
      className={`pixel-game ${hud.overview ? 'is-overview' : ''}`}
      data-player-x={Math.round(hud.x || player.x)}
      data-player-y={Math.round(hud.y || player.y)}
    >
      <canvas
        ref={canvasRef}
        className="pixel-world"
        aria-label="耳语镇可交互地图，使用方向键或 WASD 移动，E 交谈，M 查看地图"
      />
      <div className="game-vignette" />
      <header className="pixel-header">
        <div className="town-sign">
          <span className="sign-flower">✿</span>
          <div>
            <strong>耳语镇</strong>
            <small>WHISPERVILLE</small>
          </div>
        </div>
        <div className="day-card wood-panel">
          <Sun size={25} />
          <div>
            <strong>春 · 1 日 · 星期一</strong>
            <span>
              {clock} <i /> {hud.location}
            </span>
          </div>
        </div>
      </header>
      <aside className="quest-card paper-panel" aria-label="当前任务">
        <div className="quest-caption">
          <span>✦ 小镇手记</span>
          <small>{player.shared.length ? '自由时光' : '初来乍到'}</small>
        </div>
        <h1>{quest.title}</h1>
        <p>{quest.text}</p>
        <button
          className="pixel-button quest-go"
          onClick={() => (quest.target ? visit(quest.target) : worldRef.current?.toggleMap())}
          disabled={!player.introSeen || Boolean(dialogue || panel || modalOpen)}
        >
          {quest.action}
          <ChevronRight size={15} />
        </button>
      </aside>
      <nav className="game-tools wood-panel" aria-label="小镇工具">
        <button
          title="小镇地图 M"
          aria-label="小镇地图"
          onClick={() => worldRef.current?.toggleMap()}
          className={hud.overview ? 'active' : ''}
        >
          <Map />
          <span>地图</span>
        </button>
        <button title="认识居民" onClick={() => setPanel('residents')}>
          <Users />
          <span>居民</span>
        </button>
        <button title="查看手记" onClick={() => setPanel('journal')}>
          <BookOpen />
          <span>手记</span>
        </button>
        <span className="tool-divider" />
        <button aria-label="玩法帮助" onClick={() => onModal('help')}>
          <HelpCircle />
          <span>帮助</span>
        </button>
        <button aria-label="设置" onClick={() => onModal('settings')}>
          <Settings2 />
          <span>设置</span>
        </button>
      </nav>
      {hud.overview && (
        <div className="map-caption paper-panel">
          耳语镇全图 <span>点击地面出发 · 点击居民交谈 · M 返回</span>
        </div>
      )}
      <div className="map-zoom wood-panel">
        <button aria-label="放大地图" onClick={() => worldRef.current?.zoom(0.25)}>
          <ZoomIn size={17} />
        </button>
        <button aria-label="缩小地图" onClick={() => worldRef.current?.zoom(-0.25)}>
          <ZoomOut size={17} />
        </button>
        <button
          className={hud.cutaway ? 'active' : ''}
          title="透视房屋 V"
          aria-label="切换室内透视"
          onClick={() => worldRef.current?.toggleCutaway()}
        >
          <House size={17} />
          <small>{hud.cutaway ? '屋顶' : '室内'}</small>
        </button>
      </div>
      <footer className="game-footer">
        <div className="inventory wood-panel">
          <button className="bag-player" title="这是你，新来的邻居">
            <PixelPortrait id="player" />
          </button>
          <button
            className={`inventory-slot ${player.hasNotice ? 'has-item' : ''}`}
            aria-label={player.hasNotice ? '阅读校务公告' : '还没有校务公告，去找乔安'}
            disabled={!player.hasNotice}
            onClick={() => onModal('evidence')}
          >
            <ScrollText size={25} />
            <small>{player.hasNotice ? '校务公告' : '空背包'}</small>
            {player.hasNotice && <b>{game.remaining}</b>}
          </button>
          <div className="bag-label">
            <strong>新来的邻居</strong>
            <span>{player.visited.length} / 8 位居民已认识</span>
          </div>
        </div>
        <div className="walk-hint">
          <span>
            <kbd>W A S D</kbd> / <kbd>↑ ↓ ← →</kbd> 移动
          </span>
          <span>点击地面也可以走路</span>
        </div>
        <button
          className={`talk-button pixel-button ${hud.nearby ? 'can-talk' : ''}`}
          onClick={() => worldRef.current?.interact()}
          disabled={blocked}
        >
          <MessageCircle size={19} />
          <span>{hud.nearby ? `和${residentById(hud.nearby).name}交谈` : '走近居民交谈'}</span>
          <kbd>E</kbd>
        </button>
      </footer>
      <div className="touch-pad" aria-label="触屏方向键">
        {[
          ['w', '向上', ArrowUp],
          ['a', '向左', ArrowLeft],
          ['s', '向下', ArrowDown],
          ['d', '向右', ArrowRight],
        ].map(([key, label, Icon]) => (
          <button
            key={key}
            className={`touch-${key}`}
            aria-label={label}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              worldRef.current?.setKey(key, true);
            }}
            onPointerUp={() => worldRef.current?.setKey(key, false)}
            onPointerCancel={() => worldRef.current?.setKey(key, false)}
          >
            <Icon size={21} />
          </button>
        ))}
      </div>
      {hint && (
        <div className="pixel-hint" role="status">
          {hint}
        </div>
      )}
      {storageFailed && <div className="pixel-save-warning">当前浏览器无法保存进度</div>}
      {!player.introSeen && (
        <div className="welcome-shade">
          <section className="welcome-card paper-panel" aria-label="欢迎来到耳语镇">
            <div className="welcome-art">
              <PixelPortrait id="lin" />
              <PixelPortrait id="player" />
              <PixelPortrait id="qiao" />
            </div>
            <span className="pixel-eyebrow">A LITTLE TOWN. A LITTLE STORY.</span>
            <h1>你好，新的邻居。</h1>
            <p>
              搬来耳语镇的第一天，
              <br />
              从一杯咖啡，和一句「你好」开始。
            </p>
            <div className="welcome-controls">
              <span>
                <kbd>WASD</kbd> 走一走
              </span>
              <span>
                <kbd>E</kbd> 聊一聊
              </span>
              <span>
                <kbd>M</kbd> 逛小镇
              </span>
            </div>
            <button
              className="pixel-button start-button"
              disabled={!ready}
              onClick={() => updatePlayer({ introSeen: true })}
            >
              {ready ? '开始我的小镇生活' : '正在准备小镇…'}
              <ChevronRight size={18} />
            </button>
            <small>也可以点击地面行走，点击居民交谈。</small>
          </section>
        </div>
      )}
      {dialogue && (
        <section
          className="npc-dialogue paper-panel"
          role="dialog"
          aria-modal="false"
          aria-label={`与${resident.name}交谈`}
        >
          <div className="dialogue-person">
            <div className="portrait-frame">
              <PixelPortrait id={resident.id} />
            </div>
            <strong>{resident.name}</strong>
            <small>{resident.role}</small>
          </div>
          <div className="dialogue-content">
            <div className="dialogue-top">
              <span>正在和你交谈</span>
              <button aria-label="结束交谈" onClick={() => setDialogue(null)}>
                <X size={19} />
              </button>
            </div>
            <p key={`${dialogue.id}-${dialogue.topic}`} className="spoken-line">
              {dialogue.text}
            </p>
            <div className="dialogue-choices">
              <button onClick={() => applyReply(resident.id, 'work')}>你在忙什么？</button>
              <button onClick={() => applyReply(resident.id, 'school')}>
                {resident.id === 'qiao' ? '学校明天真的停课吗？' : '听说学校明天停课了？'}
              </button>
              {player.hasNotice && (
                <button
                  disabled={busy}
                  className="share-choice"
                  onClick={() => applyReply(resident.id, 'share')}
                >
                  <ScrollText size={15} />
                  给你看校务公告
                </button>
              )}
              <button onClick={() => setDialogue(null)}>回头见 →</button>
            </div>
          </div>
        </section>
      )}
      {panel === 'residents' && (
        <Dialog
          title="住在这里的八位邻居"
          onClose={() => setPanel(null)}
          className="pixel-residents-dialog"
        >
          <p className="panel-intro">每个人都有自己的生活。点「去找 TA」，沿着小路过去打个招呼。</p>
          <div className="pixel-residents">
            {RESIDENTS.map((person) => (
              <article key={person.id}>
                <div className="resident-art">
                  <PixelPortrait id={person.id} />
                </div>
                <div>
                  <h3>
                    {person.name}
                    <small>{person.role}</small>
                  </h3>
                  <p>{hud.activities[person.id] || person.trait}</p>
                  <button className="pixel-button" onClick={() => visit(person.id)}>
                    去找 TA
                    <ChevronRight size={13} />
                  </button>
                </div>
                {player.visited.includes(person.id) && <Check className="met-check" size={16} />}
              </article>
            ))}
          </div>
        </Dialog>
      )}
      {panel === 'journal' && (
        <Dialog title="我的小镇手记" onClose={() => setPanel(null)}>
          <div className="journal-quest">
            <span>✦ {quest.title}</span>
            <h3>{quest.text}</h3>
            <p>{quest.hint}</p>
            <button
              className="pixel-button"
              onClick={() => {
                if (quest.target) visit(quest.target);
                else {
                  setPanel(null);
                  worldRef.current?.toggleMap();
                }
              }}
            >
              {quest.action}
              <ChevronRight size={14} />
            </button>
          </div>
          <h3 className="journal-heading">今天听到的事</h3>
          {player.journal.length ? (
            <ul className="journal-entries">
              {[...player.journal].reverse().map((entry) => (
                <li key={entry.id}>{entry.text}</li>
              ))}
            </ul>
          ) : (
            <p className="panel-intro">手记还是空白的，找居民聊聊学校的消息吧。</p>
          )}
          <div className="journal-status">
            <span>{stats.corrected} / 8 位居民已知道事实</span>
            <small>{mode === 'ai' ? '居民闲聊：AI + 规则' : '居民闲聊：规则演示'}</small>
          </div>
          <div className="journal-actions">
            <button onClick={onExport}>
              <Download size={15} />
              导出故事
            </button>
            <button
              onClick={() => {
                setPanel(null);
                onModal('restart');
              }}
            >
              <RotateCcw size={15} />
              重新开始
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
