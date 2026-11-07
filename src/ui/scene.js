import { HOME_POSITIONS, sampleRoute } from '../simulation/village.js';
export const MAP_POSITIONS = HOME_POSITIONS;

export const toWorld = (THREE, id, position = MAP_POSITIONS[id]) => {
  const [x, y] = position;
  return new THREE.Vector3((x / 860 - 0.5) * 12, (0.5 - y / 550) * 8, 0.12);
};

export function createTownScene(THREE, { canvas, container, markers, state }) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
  } catch {
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor('#b7c4a0', 1);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-6, 6, 4, -4, 0.1, 100);
  camera.position.z = 15;
  const world = new THREE.Group();
  scene.add(world);
  const loader = new THREE.TextureLoader();
  const textures = new Set();
  let disposed = false;
  const load = (path, onLoad) => {
    const texture = loader.load(path, (loaded) => {
      if (disposed) {
        loaded.dispose();
        return;
      }
      loaded.colorSpace = THREE.SRGBColorSpace;
      needsRender = true;
      onLoad?.();
    });
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.add(texture);
    return texture;
  };
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(12.06, 8.06, 0.12),
    new THREE.MeshBasicMaterial({ color: '#5d7250' }),
  );
  base.position.z = -0.08;
  world.add(base);
  const board = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8),
    new THREE.MeshBasicMaterial({ map: load('/town/whisperville-map.png'), toneMapped: false }),
  );
  world.add(board);
  const actors = state.current.residents.map((resident) => {
    const texture = load(`/characters/${resident.id}.png`, () => {
      if (markers.current[resident.id]) markers.current[resident.id].dataset.spriteReady = 'true';
    });
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        alphaTest: 0.08,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    sprite.center.set(0.5, 0);
    sprite.scale.set(0.64, 0.96, 1);
    sprite.position.copy(toWorld(THREE, resident.id));
    world.add(sprite);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.22, 0.245, 40),
      new THREE.MeshBasicMaterial({
        color: '#365c40',
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      }),
    );
    ring.scale.y = 0.3;
    ring.position.copy(sprite.position);
    ring.position.z = 0.04;
    world.add(ring);
    return { id: resident.id, sprite, ring };
  });
  const routes = new THREE.Group();
  world.add(routes);
  let curves = [],
    routeSignature = '';
  function clearRoutes() {
    for (const item of [...routes.children]) {
      item.geometry?.dispose();
      item.material?.dispose();
      routes.remove(item);
    }
    curves = [];
  }
  function updateRoutes() {
    clearRoutes();
    const messages = state.current.game.messages
      .filter((message) => MAP_POSITIONS[message.sender])
      .slice(-5);
    messages.forEach((message, index) => {
      const from = toWorld(
          THREE,
          message.sender,
          message.meeting?.sender || state.current.game.village?.[message.sender]?.position,
        ),
        to = toWorld(
          THREE,
          message.receiver,
          message.meeting?.receiver || state.current.game.village?.[message.receiver]?.position,
        );
      from.z = 0.3;
      to.z = 0.3;
      const middle = from.clone().lerp(to, 0.5);
      middle.y += 0.28;
      middle.z = 1;
      const curve = new THREE.QuadraticBezierCurve3(from, middle, to);
      const color = message.evidence ? '#285f49' : '#fff1ae';
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(36)),
        new THREE.LineDashedMaterial({
          color,
          dashSize: 0.08,
          gapSize: 0.07,
          transparent: true,
          opacity: 0.85,
          depthTest: false,
        }),
      );
      line.computeLineDistances();
      routes.add(line);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        new THREE.MeshBasicMaterial({ color, depthTest: false }),
      );
      routes.add(dot);
      curves.push({ curve, dot, offset: index * 0.23 });
    });
  }
  let width = 1,
    height = 1;
  let needsRender = true;
  function resize() {
    needsRender = true;
    width = container.clientWidth;
    height = container.clientHeight;
    renderer.setSize(width, height, false);
    const viewHeight = Math.max(8.1, 12.1 / (width / height));
    camera.left = (-viewHeight * width) / height / 2;
    camera.right = -camera.left;
    camera.top = viewHeight / 2;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  let sceneVisible = true;
  const visibility = new IntersectionObserver(([entry]) => {
    sceneVisible = entry.isIntersecting;
    if (sceneVisible) needsRender = true;
  });
  visibility.observe(container);
  let pointer = null,
    panX = 0,
    panY = 0,
    tilt = false,
    zoom = 1;
  const down = (event) => {
    if (event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add('dragging');
  };
  const move = (event) => {
    if (!pointer) return;
    needsRender = true;
    panX = THREE.MathUtils.clamp(panX + ((event.clientX - pointer.x) / width) * 12, -2, 2);
    panY = THREE.MathUtils.clamp(panY - ((event.clientY - pointer.y) / height) * 8, -1.5, 1.5);
    pointer = { x: event.clientX, y: event.clientY };
  };
  const up = () => {
    pointer = null;
    canvas.classList.remove('dragging');
  };
  function setZoom(value) {
    needsRender = true;
    zoom = THREE.MathUtils.clamp(value, 1, 1.65);
  }
  const wheel = (event) => {
    if (event.ctrlKey) return;
    event.preventDefault();
    setZoom(zoom - event.deltaY * 0.001);
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', wheel, { passive: false });
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame,
    lastFrame = 0;
  let viewSignature = '';
  function render(now) {
    frame = requestAnimationFrame(render);
    if (now - lastFrame < 32 || document.hidden || !sceneVisible) return;
    lastFrame = now;
    const nextSignature = `${state.current.game.id}-${state.current.game.messages.at(-1)?.id}-${state.current.selected}-${state.current.showPaths}-${state.current.motion?.progress ?? 0}`;
    const moving =
      Math.abs(panX - world.position.x) +
        Math.abs(panY - world.position.y) +
        Math.abs(zoom - camera.zoom) +
        Math.abs((tilt ? -0.12 : -0.015) - world.rotation.x) +
        Math.abs((tilt ? 0.12 : 0.012) - world.rotation.y) >
      0.0001;
    const animatedRoutes = !reducedMotion && state.current.showPaths && curves.length > 0;
    if (!needsRender && !moving && nextSignature === viewSignature && !animatedRoutes) return;
    viewSignature = nextSignature;
    needsRender = false;
    const time = now * 0.001;
    world.position.x += (panX - world.position.x) * 0.15;
    world.position.y += (panY - world.position.y) * 0.15;
    world.rotation.x += ((tilt ? -0.12 : -0.015) - world.rotation.x) * 0.1;
    world.rotation.y += ((tilt ? 0.12 : 0.012) - world.rotation.y) * 0.1;
    camera.zoom += (zoom - camera.zoom) * 0.15;
    camera.updateProjectionMatrix();
    const signature = `${state.current.game.messages.at(-1)?.id}-${state.current.game.id}`;
    if (signature !== routeSignature) {
      routeSignature = signature;
      updateRoutes();
      needsRender = true;
    }
    routes.visible = state.current.showPaths;
    curves.forEach(({ curve, dot, offset }) =>
      dot.position.copy(curve.getPoint(reducedMotion ? 0.5 : (time * 0.22 + offset) % 1)),
    );
    for (const actor of actors) {
      const selected = state.current.selected === actor.id;
      actor.ring.visible = selected;
      const scale = selected ? 1.1 : 1;
      actor.sprite.scale.set(0.64 * scale, 0.96 * scale, 1);
      const activity = state.current.motion?.activities[actor.id];
      const location = activity
        ? sampleRoute(activity.route, Math.min(1, state.current.motion.progress / 0.72))
        : state.current.game.village?.[actor.id]?.position;
      actor.sprite.position.copy(toWorld(THREE, actor.id, location));
      actor.sprite.position.z = 0.15;
      actor.ring.position.copy(actor.sprite.position);
      actor.ring.position.z = 0.04;
    }
    renderer.render(scene, camera);
    world.updateWorldMatrix(true, true);
    for (const actor of actors) {
      const position = actor.sprite.getWorldPosition(new THREE.Vector3()).project(camera);
      const marker = markers.current[actor.id];
      if (marker) {
        marker.style.left = `${Math.round((position.x * 0.5 + 0.5) * width)}px`;
        marker.style.top = `${Math.round((-position.y * 0.5 + 0.5) * height + 22)}px`;
        marker.style.setProperty(
          '--sprite-height',
          `${Math.round(((0.96 * camera.zoom) / (camera.top * 2)) * height * (state.current.selected === actor.id ? 1.1 : 1))}px`,
        );
        marker.style.visibility =
          Math.abs(position.x) > 0.99 || Math.abs(position.y) > 0.98 ? 'hidden' : 'visible';
      }
    }
    canvas.dataset.rendered = 'true';
  }
  frame = requestAnimationFrame(render);
  return {
    zoomIn: () => setZoom(zoom + 0.15),
    zoomOut: () => setZoom(zoom - 0.15),
    reset: () => {
      panX = 0;
      panY = 0;
      zoom = 1;
      tilt = false;
      needsRender = true;
    },
    tilt: () => {
      tilt = !tilt;
      needsRender = true;
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      visibility.disconnect();
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      canvas.removeEventListener('wheel', wheel);
      scene.traverse((object) => {
        object.geometry?.dispose();
        if (Array.isArray(object.material))
          object.material.forEach((material) => material.dispose());
        else object.material?.dispose();
      });
      textures.forEach((texture) => texture.dispose());
      renderer.dispose();
    },
  };
}
