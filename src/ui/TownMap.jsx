import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minus, Plus, Orbit } from 'lucide-react';
import { RESIDENTS } from '../simulation/scenario.js';
import CharacterArt from './CharacterArt.jsx';
import { MAP_POSITIONS, createTownScene } from './scene.js';
import { sampleRoute, describeActivity } from '../simulation/village.js';

export const beliefColor = (state) =>
  state.verified
    ? '#39765a'
    : state.claim === null
      ? '#919c91'
      : state.claim === 3
        ? '#b15b4a'
        : state.claim === 2
          ? '#c27c4d'
          : '#b58b42';

export default function TownMap({ game, selected, onSelect, showPaths, motion, simple = false }) {
  const container = useRef(null);
  const canvas = useRef(null);
  const markers = useRef({});
  const scene = useRef(null);
  const state = useRef({});
  const [ready, setReady] = useState(false);
  state.current = { game, selected, showPaths, residents: RESIDENTS, motion };
  useEffect(() => {
    let cancelled = false;
    import('./three-runtime.js')
      .then((THREE) => {
        if (cancelled) return;
        scene.current = createTownScene(THREE, {
          canvas: canvas.current,
          container: container.current,
          markers,
          state,
        });
        setReady(Boolean(scene.current));
      })
      .catch(() => setReady(false));
    return () => {
      cancelled = true;
      scene.current?.dispose();
      scene.current = null;
    };
  }, []);
  return (
    <div
      ref={container}
      className={`town-map ${ready ? 'three-ready' : 'map-fallback'} ${simple ? 'simple-map' : ''}`}
    >
      <img className="town-backdrop" src="/town/whisperville-map.png" alt="" />
      <canvas ref={canvas} className="town-canvas" aria-label="可拖拽和缩放的 2.5D 小镇" />
      {RESIDENTS.map((resident) => {
        const task = motion?.activities[resident.id];
        const position = task
          ? sampleRoute(task.route, Math.min(1, motion.progress / 0.72))
          : game.village?.[resident.id]?.position || MAP_POSITIONS[resident.id];
        return (
          <button
            key={resident.id}
            ref={(element) => {
              markers.current[resident.id] = element;
            }}
            className={`map-resident ${selected === resident.id ? 'selected' : ''}`}
            style={{
              left: ready ? undefined : `${(position[0] / 860) * 100}%`,
              top: ready ? undefined : `${(position[1] / 550) * 100}%`,
              '--belief': beliefColor(game.residents[resident.id]),
            }}
            onClick={() => onSelect(resident.id)}
            aria-label={`选择${resident.name}`}
            aria-pressed={selected === resident.id}
          >
            <span className="map-character-figure">
              <CharacterArt resident={resident} eager />
              <span className="belief-dot" />
            </span>
            <span className="map-name">{resident.name}</span>
            {simple && task && selected === resident.id && motion.started && (
              <span className="map-activity-label">{describeActivity(task, motion.progress)}</span>
            )}
          </button>
        );
      })}
      <div className="map-tools" aria-label="地图视角">
        {!simple && (
          <button
            onClick={() => scene.current?.tilt()}
            disabled={!ready}
            aria-label="切换立体视角"
            title="切换立体视角"
          >
            <Orbit size={17} />
          </button>
        )}
        {!simple && <span />}
        <button onClick={() => scene.current?.zoomIn()} disabled={!ready} aria-label="放大地图">
          <Plus size={17} />
        </button>
        <button onClick={() => scene.current?.zoomOut()} disabled={!ready} aria-label="缩小地图">
          <Minus size={17} />
        </button>
        <button onClick={() => scene.current?.reset()} disabled={!ready} aria-label="重置地图缩放">
          <Maximize2 size={15} />
        </button>
      </div>
      <span className="map-interaction-hint">
        {ready ? '拖拽移动 · 滚轮缩放' : '点击居民，认识小镇'}
      </span>
    </div>
  );
}
