import { storyObjects, drawStoryObject } from './story-art.js';
import { attachCameraControls } from './camera-controls.js';
import { createSpeechPlayback } from './speech.js';
import { personText, placeText, messageText } from '../i18n.js';
import { RESIDENTS } from '../simulation/scenario.js';
import { isFinished, planTurn } from '../simulation/engine.js';
import {
  createMap,
  TILE,
  MAP_WIDTH,
  MAP_HEIGHT,
  NPC_HOMES,
  PUBLIC_SPOTS,
  SPAWN,
  BUILDINGS,
  findPath,
  interactionPath,
  nearestWalkable,
  isWalkable,
  locationAt,
  indexOf,
  canTalk,
} from './map.js';
import {
  drawSpeech,
  drawSprite,
  paintMap,
  drawProp,
  paintRoof,
  paintRoofBacking,
  paintOutdoorGround,
} from './paint.js';
import { ENVIRONMENT_ASSETS, createAtlas, roofOpacity } from './environment.js';
import { createTerrainMaterials } from './terrain.js';
import { LIFE_PLACES } from '../simulation/life.js';
import { CHARACTER_SOURCES, characterSheet } from './characters.js';

const OCCUPATIONS = {
  lin: '在咖啡馆招呼客人',
  mei: '整理孩子明天的东西',
  zhou: '照料花店里的花',
  qiao: '准备明天的课程',
  tang: '整理以前送过的信',
  chen: '检查一辆自行车',
  xu: '整理图书馆的书',
  bo: '整理采访笔记',
};
const length = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const tilePoint = ([x, y]) => ({ x: (x + 0.5) * TILE, y: (y + 0.5) * TILE });

export function createPixelWorld(
  canvas,
  {
    getState,
    onInteract,
    onSnapshot,
    onReady,
    onConversation,
    onHint,
    onCycleComplete,
    onCameraChange,
  },
) {
  const map = createMap();
  let ground = paintOutdoorGround(map);
  let lastLanguage = getState().language || 'zh';
  let background = paintMap(map, undefined, ground, lastLanguage);
  const ctx = canvas.getContext('2d', { alpha: false });
  const initial = getState().player;
  const safe = isWalkable(map, Math.floor(initial.x / TILE), Math.floor(initial.y / TILE));
  const player = {
    id: 'player',
    ...(safe ? { x: initial.x, y: initial.y } : tilePoint(SPAWN)),
    direction: 0,
    path: [],
    moving: false,
  };
  const npcs = RESIDENTS.map((resident, index) => ({
    id: resident.id,
    ...tilePoint(NPC_HOMES[resident.id]),
    direction: 0,
    path: [],
    moving: false,
    wait: 2 + index * 0.12,
    activity: OCCUPATIONS[resident.id] || resident.goal,
  }));
  const images = {},
    environment = {},
    roofs = {},
    backings = {};
  function rebuildRoofs() {
    for (const b of BUILDINGS) {
      roofs[b.id] = paintRoof(b, environment.buildings);
      backings[b.id] = paintRoofBacking(b, ground);
    }
  }
  const decorations = map.props.filter((p) => !['rug', 'wildflowers'].includes(p.kind));
  let disposed = false,
    loaded = 0;
  const assets = [
    ...CHARACTER_SOURCES.map((id) => [id, `/pixel/characters/${id}.png`]),
    ...Object.entries(ENVIRONMENT_ASSETS),
  ];
  for (const [id, url] of assets) {
    const image = new Image();
    image.onload = () => {
      if (disposed) return;
      if (id === 'props') environment.props = createAtlas(image, 4, 4);
      else if (id === 'buildings') {
        environment.buildings = createAtlas(image, 4, 2);
        rebuildRoofs();
      } else if (id === 'terrain') {
        environment.terrain = createTerrainMaterials(image);
        ground = paintOutdoorGround(map, environment.terrain);
        background = paintMap(map, environment.terrain, ground, lastLanguage);
        if (environment.buildings) rebuildRoofs();
      } else {
        images[id] = image;
        for (const person of RESIDENTS.filter((p) => p.sprite === id))
          images[person.id] = characterSheet(image, person.id);
      }
      loaded++;
      if (loaded === assets.length) onReady?.();
    };
    image.onerror = () => {
      if (disposed) return;
      loaded++;
      onHint?.(
        getState().language === 'en'
          ? 'An image failed to load. Refresh to retry.'
          : '有一张素材没有加载，刷新页面可以重试。',
      );
      if (loaded === assets.length) onReady?.();
    };
    image.src = url;
  }
  let width = 1,
    height = 1,
    zoom = 1.75,
    overview = Boolean(getState().observer) && canvas.clientWidth > 700,
    cutaway = Boolean(getState().observer),
    time = 0,
    lastFrame = 0,
    frame,
    lastSnapshot = 0,
    nearby = null,
    pending = null,
    batch = null,
    nextConversation = 12,
    lastSignature = '';
  const speechPlayback = createSpeechPlayback(getState().game);
  const camera = { x: 0, y: 0, scale: 2 };
  let followId =
      getState().observer && canvas.clientWidth <= 700 ? getState().focus || 'lin' : null,
    anchor = { x: (MAP_WIDTH * TILE) / 2, y: (MAP_HEIGHT * TILE) / 2 };
  const keys = new Set();
  const opacityFor = (b) =>
    environment.buildings
      ? roofOpacity(
          b,
          getState().observer ? npcs.find((p) => p.id === followId) || anchor : player,
          cutaway,
        )
      : 0;
  const roomAt = (x, y) =>
    BUILDINGS.find(
      (b) => x >= b.x * TILE && x < (b.x + b.w) * TILE && y >= b.y * TILE && y < (b.y + b.h) * TILE,
    );
  const resize = () => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    canvas.width = Math.round(width);
    canvas.height = Math.round(height);
    ctx.imageSmoothingEnabled = false;
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  const closeEnough = (a, b) => canTalk(map, [a.x / TILE, a.y / TILE], [b.x / TILE, b.y / TILE]);
  // Recenter interrupted movement before taking another cardinal step.
  function routePoints(actor, path) {
    const center = tilePoint([Math.floor(actor.x / TILE), Math.floor(actor.y / TILE)]);
    return [...(length(actor, center) > 0.5 ? [center] : []), ...path.map(tilePoint)];
  }
  function destinationFor(id, place) {
    const person = RESIDENTS.find((p) => p.id === id);
    if (person.home === place) return NPC_HOMES[id];
    const center = LIFE_PLACES.find((p) => p.id === place).tile;
    const building = BUILDINGS.find((b) => b.id === place);
    const candidates = [];
    for (let y = center[1] - 2; y <= center[1] + 2; y++)
      for (let x = center[0] - 3; x <= center[0] + 3; x++) {
        if (
          isWalkable(map, x, y) &&
          (!building ||
            (x > building.x &&
              x < building.x + building.w - 1 &&
              y > building.y &&
              y < building.y + building.h - 1))
        )
          candidates.push([x, y]);
      }
    return candidates[RESIDENTS.indexOf(person) % candidates.length] || center;
  }
  function activityText(npc, state) {
    const en = state.language === 'en',
      status = npc.status;
    const name = status?.partner && personText(status.partner, 'name', state.language);
    if (status?.kind === 'travel')
      return en ? `Walking to ${placeText(status.place, 'en')}` : `前往${placeText(status.place)}`;
    if (status?.kind === 'wait') return en ? `Waiting for ${name} to talk` : `等${name}过来聊聊`;
    if (status?.kind === 'visit') return en ? `Going to talk with ${name}` : `去找${name}聊聊`;
    if (status?.kind === 'talk') return en ? `Talking with ${name}` : `和${name}交谈`;
    const intent = state.observer && state.game.intentions?.find((p) => p.id === npc.id);
    if (intent) {
      const building = BUILDINGS.find((b) => b.id === intent.place);
      const target = LIFE_PLACES.find((p) => p.id === intent.place).tile;
      const arrived = building
        ? roomAt(npc.x, npc.y)?.id === building.id
        : length(npc, tilePoint(target)) < TILE * 4;
      if (arrived) return en ? intent.activityEn || intent.activity : intent.activity;
      const here = roomAt(npc.x, npc.y)?.id || 'river';
      return en ? `Spending time at ${placeText(here, 'en')}` : `在${placeText(here)}活动`;
    }
    return en ? personText(npc.id, 'goal', 'en') : npc.activity;
  }
  function go(actor, target) {
    const path = findPath(map, [actor.x / TILE, actor.y / TILE], target);
    actor.path = routePoints(actor, path);
    actor.status = {
      kind: 'travel',
      place: BUILDINGS.find((b) => b.name === locationAt(target[0], target[1]))?.id || 'river',
    };
    return path.length > 0;
  }
  function goToNpc(id) {
    if (getState().blocked) return;
    const npc = npcs.find((person) => person.id === id);
    if (!npc) return;
    pending = id;
    npc.path = [];
    npc.moving = false;
    if (closeEnough(player, npc)) {
      pending = null;
      onInteract(id);
      return;
    }
    const route = interactionPath(
      map,
      [player.x / TILE, player.y / TILE],
      [npc.x / TILE, npc.y / TILE],
    );
    if (!route) {
      pending = null;
      onHint?.('暂时走不到那里，试试从门口进去。');
      return;
    }
    player.path = routePoints(player, route.path);
  }
  function interact() {
    const closest = [...npcs]
      .filter((npc) => closeEnough(player, npc))
      .sort((a, b) => length(player, a) - length(player, b))[0];
    if (closest) {
      player.path = [];
      pending = null;
      onInteract(closest.id);
    } else onHint?.('先走近一位居民，再按 E 交谈。也可以直接点击居民。');
  }
  function walk(actor, dt, speed) {
    actor.moving = false;
    const target = actor.path[0];
    if (!target) return;
    const dx = target.x - actor.x,
      dy = target.y - actor.y,
      distance = Math.hypot(dx, dy),
      step = speed * dt;
    actor.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
    if (distance <= step) {
      actor.x = target.x;
      actor.y = target.y;
      actor.path.shift();
    } else {
      actor.x += (dx / distance) * step;
      actor.y += (dy / distance) * step;
    }
    actor.moving = true;
  }
  function canStand(x, y) {
    return [
      [-4, -3],
      [4, -3],
      [-4, 3],
      [4, 3],
    ].every(([dx, dy]) =>
      isWalkable(map, Math.floor((x + dx) / TILE), Math.floor((y + dy) / TILE)),
    );
  }
  function readKeys(dt) {
    let dx =
      Number(keys.has('d') || keys.has('arrowright')) -
      Number(keys.has('a') || keys.has('arrowleft'));
    let dy =
      Number(keys.has('s') || keys.has('arrowdown')) - Number(keys.has('w') || keys.has('arrowup'));
    if (!dx && !dy) return false;
    player.path = [];
    pending = null;
    const magnitude = Math.hypot(dx, dy);
    dx = (dx / magnitude) * 76 * dt;
    dy = (dy / magnitude) * 76 * dt;
    if (canStand(player.x + dx, player.y)) player.x += dx;
    if (canStand(player.x, player.y + dy)) player.y += dy;
    player.direction = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 1 : 2) : dy < 0 ? 3 : 0;
    player.moving = true;
    return true;
  }
  function updatePeople(dt, state) {
    const signature = `${state.game.id}-${state.game.round}-${state.game.messages.at(-1)?.id}`;
    if (signature !== lastSignature) {
      lastSignature = signature;
      npcs.forEach((npc, index) => {
        npc.wait = Math.min(npc.wait, time + 0.2 + index * 0.03);
      });
      batch = null;
      nextConversation = time + (state.observer ? 2 : 12);
    }
    if (!batch && time >= nextConversation && !isFinished(state.game)) {
      const plans = planTurn(state.game, state.observer ? state.game.intentions : undefined);
      const reserved = new Set(plans.flatMap((plan) => [plan.sender, plan.receiver]));
      batch = { plans, reserved, started: time, requested: false, signature };
      for (const plan of plans) {
        const sender = npcs.find((person) => person.id === plan.sender),
          receiver = npcs.find((person) => person.id === plan.receiver);
        receiver.path = [];
        receiver.moving = false;
        receiver.status = { kind: 'wait', partner: sender.id };
        const route = interactionPath(
          map,
          [sender.x / TILE, sender.y / TILE],
          [receiver.x / TILE, receiver.y / TILE],
        );
        sender.path = routePoints(sender, route?.path || []);
        sender.status = { kind: 'visit', partner: receiver.id };
      }
    }
    // A player may interrupt someone en route. Resume the actual meeting afterward.
    if (batch && !batch.requested) {
      for (const plan of batch.plans) {
        const sender = npcs.find((person) => person.id === plan.sender);
        const receiver = npcs.find((person) => person.id === plan.receiver);
        if (
          sender.id !== pending &&
          !sender.path.length &&
          length(sender, receiver) >= TILE * 1.9
        ) {
          const route = interactionPath(
            map,
            [sender.x / TILE, sender.y / TILE],
            [receiver.x / TILE, receiver.y / TILE],
          );
          if (route) sender.path = routePoints(sender, route.path);
        }
      }
    }
    for (const npc of npcs) {
      if (npc.id === pending || npc.id === state.dialogNpc) {
        npc.moving = false;
        continue;
      }
      if (!npc.path.length && !batch?.reserved.has(npc.id) && time >= npc.wait) {
        const index = RESIDENTS.findIndex((person) => person.id === npc.id);
        const intention = state.observer && state.game.intentions?.find((p) => p.id === npc.id);
        const target = intention
          ? destinationFor(npc.id, intention.place)
          : Math.floor(time / 14 + index) % 3 === 0
            ? NPC_HOMES[npc.id]
            : PUBLIC_SPOTS[(Math.floor(time / 17) + index) % PUBLIC_SPOTS.length];
        go(npc, target);
        if (intention)
          npc.status = npc.path.length
            ? { kind: 'travel', place: intention.place }
            : { kind: 'routine' };
        npc.wait = time + 9 + index * 0.5;
      }
      walk(npc, dt, 35);
      if (!npc.path.length && !npc.moving && !batch?.reserved.has(npc.id))
        npc.status = { kind: 'routine' };
    }
    if (
      batch &&
      !batch.requested &&
      time - batch.started > 2 &&
      batch.plans.every((plan) => {
        const a = npcs.find((person) => person.id === plan.sender),
          b = npcs.find((person) => person.id === plan.receiver);
        return !a.path.length && length(a, b) < TILE * 1.9;
      })
    ) {
      batch.requested = true;
      for (const plan of batch.plans) {
        const a = npcs.find((person) => person.id === plan.sender),
          b = npcs.find((person) => person.id === plan.receiver);
        a.status = { kind: 'talk', partner: b.id };
        b.status = { kind: 'talk', partner: a.id };
      }
      Promise.resolve(
        onConversation({
          actors: Object.fromEntries(npcs.map((p) => [p.id, { x: p.x, y: p.y, moving: p.moving }])),
        }),
      ).finally(() => {
        if (disposed) return;
        batch = null;
        nextConversation = time + 14;
        onCycleComplete?.();
      });
    }
  }
  function updateCamera() {
    const targetScale = overview
      ? Math.min(
          (width - 36) / (MAP_WIDTH * TILE),
          Math.max(1, height - (width <= 700 ? 24 : 180)) / (MAP_HEIGHT * TILE),
        )
      : zoom;
    camera.scale = targetScale;
    const vw = width / targetScale,
      vh = height / targetScale;
    const focus = getState().observer
      ? overview
        ? { x: (MAP_WIDTH * TILE) / 2, y: (MAP_HEIGHT * TILE) / 2 }
        : npcs.find((p) => p.id === followId) || anchor
      : player;
    if (getState().observer) {
      camera.x = Math.round(Math.max(0, Math.min(MAP_WIDTH * TILE, focus.x)) - vw / 2);
      camera.y = Math.round(Math.max(0, Math.min(MAP_HEIGHT * TILE, focus.y)) - vh / 2);
      return;
    }
    camera.x =
      vw >= MAP_WIDTH * TILE
        ? (MAP_WIDTH * TILE - vw) / 2
        : Math.max(0, Math.min(MAP_WIDTH * TILE - vw, focus.x - vw / 2));
    camera.y =
      vh >= MAP_HEIGHT * TILE
        ? (MAP_HEIGHT * TILE - vh) / 2
        : Math.max(0, Math.min(MAP_HEIGHT * TILE - vh, focus.y - vh / 2));
    camera.x = Math.round(camera.x);
    camera.y = Math.round(camera.y);
  }
  function draw(now, state) {
    if (lastLanguage !== (state.language || 'zh')) {
      lastLanguage = state.language || 'zh';
      background = paintMap(map, environment.terrain, ground, lastLanguage);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#74a345';
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(
      camera.scale,
      0,
      0,
      camera.scale,
      -camera.x * camera.scale,
      -camera.y * camera.scale,
    );
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(background, 0, 0);
    // Ground masks are composited before every person, never in the depth-sorted sprite pass.
    for (const b of BUILDINGS) {
      const opacity = opacityFor(b);
      if (backings[b.id] && opacity > 0) {
        ctx.globalAlpha = opacity;
        ctx.drawImage(backings[b.id], b.x * TILE, b.y * TILE - 16);
      }
    }
    ctx.globalAlpha = 1;
    // Animated reflections and drifting petals keep the spring scene moving gently.
    ctx.fillStyle = '#b4e1d7';
    for (let y = 3; y < MAP_HEIGHT; y += 5) {
      const x = 46 * TILE + 8 + ((Math.floor(now / 650) + y * 3) % 43);
      if (map.terrain[indexOf(46, y)] === 2) ctx.fillRect(x, y * TILE + 5, 5, 1);
    }
    const questTarget = state.quest?.target;
    const renderables = [
      ...npcs,
      ...(state.observer ? storyObjects(state.game) : []),
      ...(state.observer ? [] : [player]),
      ...decorations.map((p) => ({ prop: p, y: (p.y + p.h) * TILE })),
      ...BUILDINGS.map((b) => ({ roof: b, y: (b.y + b.h) * TILE - 4 })),
    ];
    renderables
      .sort((a, b) => a.y - b.y)
      .forEach((actor) => {
        if (actor.storyProp) {
          const room = roomAt(actor.x, actor.y);
          ctx.globalAlpha = room ? 1 - opacityFor(room) : 1;
          drawStoryObject(ctx, actor, time, state.language);
          ctx.globalAlpha = 1;
          return;
        }
        if (actor.prop) {
          const p = actor.prop;
          if (
            p.x * TILE > camera.x + width / camera.scale + 70 ||
            p.x * TILE < camera.x - 90 ||
            p.y * TILE > camera.y + height / camera.scale + 70 ||
            p.y * TILE < camera.y - 90
          )
            return;
          const room = roomAt((p.x + 0.5) * TILE, (p.y + 0.5) * TILE);
          ctx.globalAlpha = room ? 1 - opacityFor(room) : 1;
          drawProp(ctx, p, environment.props);
          ctx.globalAlpha = 1;
          return;
        }
        if (actor.roof) {
          const b = actor.roof,
            opacity = opacityFor(b);
          if (roofs[b.id] && opacity > 0) {
            ctx.globalAlpha = opacity;
            ctx.drawImage(roofs[b.id], b.x * TILE, b.y * TILE - 16);
            ctx.globalAlpha = 1;
          }
          return;
        }
        const room = roomAt(actor.x, actor.y);
        if (actor.id !== 'player' && room && opacityFor(room) > 0.95) return;
        ctx.globalAlpha = actor.id !== 'player' && room ? 1 - opacityFor(room) : 1;
        drawSprite(
          ctx,
          images[actor.id],
          actor.id,
          actor.x,
          actor.y,
          actor.direction,
          actor.moving,
          now / 1000,
          actor.id === 'player',
        );
        ctx.globalAlpha = 1;
        if (
          actor.id !== 'player' &&
          (state.observer ||
            overview ||
            length(player, actor) < TILE * 5 ||
            actor.id === questTarget)
        ) {
          const name = personText(actor.id, 'name', state.language);
          ctx.font = '9px "Microsoft YaHei",sans-serif';
          const textWidth = ctx.measureText(name).width;
          ctx.fillStyle = '#fff5ddeb';
          ctx.fillRect(
            Math.round(actor.x - textWidth / 2 - 3),
            Math.round(actor.y + 4),
            Math.ceil(textWidth) + 6,
            12,
          );
          ctx.fillStyle = '#72583d';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.fillText(name, Math.round(actor.x), Math.round(actor.y + 5));
          ctx.textAlign = 'left';
        }
        if (actor.id === questTarget) {
          ctx.fillStyle = '#fff1a2';
          ctx.fillRect(Math.round(actor.x - 3), Math.round(actor.y - 56), 6, 11);
          ctx.fillStyle = '#b5833f';
          ctx.fillRect(Math.round(actor.x - 1), Math.round(actor.y - 54), 2, 6);
          ctx.fillRect(Math.round(actor.x - 1), Math.round(actor.y - 47), 2, 1);
        }
      });
    const targetNpc = npcs.find((person) => person.id === questTarget);
    const targetRoom =
      targetNpc &&
      BUILDINGS.find(
        (b) =>
          targetNpc.x / TILE >= b.x &&
          targetNpc.x / TILE < b.x + b.w &&
          targetNpc.y / TILE >= b.y &&
          targetNpc.y / TILE < b.y + b.h,
      );
    if (targetRoom && opacityFor(targetRoom) > 0.55) {
      const markerX = (targetRoom.x + Math.floor(targetRoom.w / 2) + 1) * TILE,
        markerY = (targetRoom.y + targetRoom.h) * TILE - 23;
      ctx.font = '9px "Microsoft YaHei",sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#5b3d28';
      ctx.fillRect(markerX - 23, markerY - 1, 46, 16);
      ctx.fillStyle = '#ffe7a4';
      ctx.fillRect(markerX - 22, markerY - 2, 44, 14);
      ctx.fillStyle = '#785129';
      ctx.fillText(`! ${RESIDENTS.find((p) => p.id === questTarget).name}`, markerX, markerY + 1);
      ctx.textAlign = 'left';
    }
    for (let i = 0; i < 14; i++) {
      const px = (i * 113 + time * 8) % (MAP_WIDTH * TILE),
        py = (i * 83 + time * 5 + Math.sin(time + i) * 4) % (MAP_HEIGHT * TILE);
      const inside = BUILDINGS.some(
        (b) =>
          px > b.x * TILE && px < (b.x + b.w) * TILE && py > b.y * TILE && py < (b.y + b.h) * TILE,
      );
      if (!inside) {
        ctx.fillStyle = i % 3 === 0 ? '#f7dda6' : '#f1bec1';
        ctx.fillRect(Math.round(px), Math.round(py), 2, 1);
      }
    }
    if (nearby && !state.blocked && !state.observer) {
      const actor = npcs.find((person) => person.id === nearby);
      ctx.font = '9px "Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#fff8d9';
      ctx.fillRect(Math.round(actor.x - 15), Math.round(actor.y - 45), 30, 12);
      ctx.fillStyle = '#7e5d3f';
      ctx.textAlign = 'center';
      ctx.fillText('E 交谈', actor.x, actor.y - 43);
      ctx.textAlign = 'left';
    }
    // Render the most recently committed segment at its recorded meeting coordinates.
    if (state.observer)
      for (const message of state.game.messages.filter(
        (m) => m.round === state.game.round && m.parentId && m.pixelMeeting,
      )) {
        const a = message.pixelMeeting.sender,
          b = message.pixelMeeting.receiver,
          color = message.evidence ? '#dceeb0' : '#ffe1a1';
        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y - 20);
        ctx.lineTo(b.x, b.y - 20);
        ctx.stroke();
        const angle = Math.atan2(b.y - a.y, b.x - a.x),
          tip = { x: b.x - Math.cos(angle) * 5, y: b.y - 20 - Math.sin(angle) * 5 };
        ctx.beginPath();
        ctx.moveTo(tip.x, tip.y);
        ctx.lineTo(tip.x - Math.cos(angle - 0.55) * 5, tip.y - Math.sin(angle - 0.55) * 5);
        ctx.lineTo(tip.x - Math.cos(angle + 0.55) * 5, tip.y - Math.sin(angle + 0.55) * 5);
        ctx.closePath();
        ctx.fill();
        ctx.font = '7px Microsoft YaHei,sans-serif';
        ctx.textAlign = 'center';
        const label = `${personText(message.sender, 'name', state.language)} → ${personText(message.receiver, 'name', state.language)}`;
        const labelWidth = ctx.measureText(label).width + 8,
          x = (a.x + b.x) / 2,
          y = Math.min(a.y, b.y) - 52;
        ctx.fillStyle = '#42543bec';
        ctx.fillRect(x - labelWidth / 2, y, labelWidth, 12);
        ctx.fillStyle = color;
        ctx.fillText(label, x, y + 9);
        ctx.textAlign = 'left';
      }
    const speech =
      !state.observer &&
      speechPlayback.messages.find(
        (message) =>
          message.sender === nearby ||
          length(
            player,
            npcs.find((person) => person.id === message.sender),
          ) <
            TILE * 6,
      );
    if (speech && !state.blocked) {
      const actor = npcs.find((person) => person.id === speech.sender);
      drawSpeech(ctx, messageText(speech, state.language), actor.x, actor.y - 45);
    }
    if (player.path.length) {
      const target = player.path.at(-1);
      ctx.strokeStyle = '#fff0a899';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(target.x - 5), Math.round(target.y - 4), 10, 8);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    canvas.dataset.cameraX = String(camera.x);
    canvas.dataset.cameraY = String(camera.y);
    canvas.dataset.scale = String(camera.scale);
    canvas.dataset.following = followId || '';
    canvas.dataset.ready = loaded === assets.length ? 'true' : 'loading';
    canvas.dataset.art = environment.buildings && environment.props ? 'detailed' : 'fallback';
    canvas.dataset.terrain = environment.terrain ? 'textured' : 'fallback';
    canvas.dataset.cutaway = String(cutaway);
    canvas.dataset.interior = BUILDINGS.some(
      (b) =>
        player.x / TILE > b.x &&
        player.x / TILE < b.x + b.w &&
        player.y / TILE > b.y &&
        player.y / TILE < b.y + b.h,
    )
      ? 'true'
      : 'false';
  }
  function frameLoop(now) {
    frame = requestAnimationFrame(frameLoop);
    if (now - lastFrame < 30) return;
    const realDt = Math.min(0.1, (now - lastFrame) / 1000 || 0.03);
    const dt = Math.min(0.06, realDt) * (getState().speed || 1);
    lastFrame = now;
    const state = getState();
    // Sync even while paused: a one-segment step pauses as soon as its messages commit.
    speechPlayback.sync(state.game);
    speechPlayback.tick(
      realDt,
      document.hidden || state.blocked || state.busy || state.speechHidden,
    );
    if (!document.hidden && !state.blocked && !(state.observer && speechPlayback.messages.length)) {
      time += dt;
      player.moving = false;
      if (!state.observer && !readKeys(dt)) walk(player, dt, 76);
      if (!state.busy) updatePeople(dt, state);
      if (pending) {
        const npc = npcs.find((person) => person.id === pending);
        if (closeEnough(player, npc)) {
          const id = pending;
          pending = null;
          player.path = [];
          onInteract(id);
        }
      }
    } else {
      player.moving = false;
      npcs.forEach((npc) => {
        npc.moving = false;
      });
    }
    const closest = [...npcs]
      .filter((npc) => closeEnough(player, npc))
      .sort((a, b) => length(player, a) - length(player, b))[0];
    nearby = closest?.id || null;
    updateCamera();
    draw(now, state);
    if (now - lastSnapshot > (speechPlayback.messages.length ? 80 : 300)) {
      lastSnapshot = now;
      onSnapshot?.({
        x: player.x,
        y: player.y,
        location: locationAt(player.x / TILE, player.y / TILE),
        nearby,
        overview,
        cutaway,
        loaded,
        following: followId,
        camera: { ...camera },
        speechSurface: { left: canvas.offsetLeft || 0, top: canvas.offsetTop || 0, width, height },
        speeches: speechPlayback.messages.map((message) => {
          const actor = npcs.find((person) => person.id === message.sender);
          const room = roomAt(actor.x, actor.y);
          return {
            message,
            x: (actor.x - camera.x) * camera.scale,
            y: (actor.y - 42 - camera.y) * camera.scale,
            visible: !room || opacityFor(room) < 0.6,
          };
        }),
        meeting: batch
          ? {
              total: batch.plans.length,
              arrived: batch.plans.filter((plan) => {
                const a = npcs.find((p) => p.id === plan.sender),
                  b = npcs.find((p) => p.id === plan.receiver);
                return !a.path.length && length(a, b) < TILE * 1.9;
              }).length,
              requested: batch.requested,
            }
          : null,
        activities: Object.fromEntries(npcs.map((npc) => [npc.id, activityText(npc, state)])),
        activitiesZh: Object.fromEntries(
          npcs.map((npc) => [npc.id, activityText(npc, { ...state, language: 'zh' })]),
        ),
        activitiesEn: Object.fromEntries(
          npcs.map((npc) => [npc.id, activityText(npc, { ...state, language: 'en' })]),
        ),
        actors: Object.fromEntries(npcs.map((npc) => [npc.id, { x: npc.x, y: npc.y }])),
        moving: player.moving,
      });
    }
  }
  const keydown = (event) => {
    const state = getState();
    if (state.observer) {
      if (state.interactionBlocked) return;
      if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(event.target.tagName)) return;
      const key = event.key.toLowerCase();
      if (key === 'm') {
        event.preventDefault();
        overview = !overview;
      }
      if (key === 'v') {
        event.preventDefault();
        cutaway = !cutaway;
      }
      if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        event.preventDefault();
        const target = npcs.find((p) => p.id === followId) || anchor;
        anchor = { ...target };
        followId = null;
        overview = false;
        anchor.x += key === 'arrowleft' ? -48 : key === 'arrowright' ? 48 : 0;
        anchor.y += key === 'arrowup' ? -48 : key === 'arrowdown' ? 48 : 0;
      }
      return;
    }
    if (state.blocked || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright'].includes(key)) {
      event.preventDefault();
      keys.add(key);
    }
    if (event.repeat) return;
    if (key === 'e') {
      event.preventDefault();
      interact();
    }
    if (key === 'm') {
      event.preventDefault();
      overview = !overview;
    }
    if (key === 'v') {
      event.preventDefault();
      cutaway = !cutaway;
    }
  };
  const keyup = (event) => keys.delete(event.key.toLowerCase());
  const blur = () => {
    keys.clear();
    player.path = [];
  };
  const click = (event) => {
    if (getState().blocked && !getState().observer) return;
    const bounds = canvas.getBoundingClientRect(),
      x = (event.clientX - bounds.left) / camera.scale + camera.x,
      y = (event.clientY - bounds.top) / camera.scale + camera.y;
    const npc = [...npcs]
      .reverse()
      .find((person) => Math.abs(x - person.x) < 18 && y >= person.y - 43 && y <= person.y + 10);
    if (getState().observer) {
      if (getState().interactionBlocked) return;
      if (npc) {
        onInteract(npc.id);
        return;
      }
      const prop = storyObjects(getState().game).find(
        (p) => Math.abs(x - p.x) < 14 && Math.abs(y - p.y) < 18,
      );
      if (prop) {
        onHint?.(
          prop.storyProp === 'cat'
            ? getState().language === 'en'
              ? 'Chestnut is resting here. Will Zhou’s clue bring the neighbors over?'
              : '栗子在这里休息。周木的线索会把邻居们带过来吗？'
            : getState().language === 'en'
              ? 'Tea starts at 09:30. Invitations travel through conversations; you can also share one in the story panel.'
              : '茶会 09:30 开始。居民会互相转告邀请，也可以在左侧分享。',
        );
        return;
      }
      anchor = { x, y };
      followId = null;
      overview = false;
      return;
    }
    if (npc) {
      goToNpc(npc.id);
      if (overview) overview = false;
      return;
    }
    const building = BUILDINGS.find(
      (b) =>
        x >= b.x * TILE &&
        x < (b.x + b.w) * TILE &&
        y >= b.y * TILE &&
        y < (b.y + b.h) * TILE &&
        opacityFor(b) > 0.6,
    );
    if (building) {
      goToNpc(building.resident);
      overview = false;
      return;
    }
    const tile = nearestWalkable(map, Math.floor(x / TILE), Math.floor(y / TILE));
    if (!tile) return;
    pending = null;
    const path = findPath(map, [player.x / TILE, player.y / TILE], tile);
    player.path = path.length ? routePoints(player, path) : [];
    if (overview) overview = false;
  };
  const cleanupCamera = attachCameraControls(canvas, {
    enabled: () => Boolean(getState().observer && !getState().interactionBlocked),
    onTap: click,
    onPanStart: () => {
      anchor = {
        x: camera.x + width / (2 * camera.scale),
        y: camera.y + height / (2 * camera.scale),
      };
      followId = null;
      if (overview) {
        overview = false;
        zoom = camera.scale;
      }
      updateCamera();
    },
    onPan: (dx, dy) => {
      anchor = {
        x: camera.x + width / (2 * camera.scale) - dx / camera.scale,
        y: camera.y + height / (2 * camera.scale) - dy / camera.scale,
      };
      updateCamera();
    },
    onZoom: (factor, x, y) => {
      const world = { x: camera.x + x / camera.scale, y: camera.y + y / camera.scale };
      zoom = Math.max(0.5, Math.min(3, camera.scale * factor));
      overview = false;
      followId = null;
      anchor = { x: world.x - (x - width / 2) / zoom, y: world.y - (y - height / 2) / zoom };
      updateCamera();
    },
    onChange: onCameraChange,
  });
  const legacyPointerDown = (event) => {
    if (!getState().observer) click(event);
  };
  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', blur);
  canvas.addEventListener('pointerdown', legacyPointerDown);
  frame = requestAnimationFrame(frameLoop);
  return {
    dismissSpeech: (id) => speechPlayback.dismiss(id),
    goToNpc,
    interact,
    toggleMap: () => {
      overview = !overview;
    },
    toggleCutaway: () => {
      cutaway = !cutaway;
    },
    follow: (id) => {
      followId = id;
      overview = false;
    },
    setKey: (key, pressed) => {
      if (pressed) keys.add(key);
      else keys.delete(key);
    },
    zoom: (delta) => {
      if (overview)
        anchor = {
          x: camera.x + width / (2 * camera.scale),
          y: camera.y + height / (2 * camera.scale),
        };
      zoom = Math.max(0.5, Math.min(3, (overview ? camera.scale : zoom) + delta));
      overview = false;
      onCameraChange?.('zoom');
    },
    snapshot: () => ({
      x: player.x,
      y: player.y,
      actors: npcs.map((npc) => ({ id: npc.id, x: npc.x, y: npc.y })),
      camera: { ...camera },
    }),
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
      canvas.removeEventListener('pointerdown', legacyPointerDown);
      cleanupCamera();
      keys.clear();
    },
  };
}
