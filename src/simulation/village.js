import { RESIDENTS } from './scenario.js';

export const PLACES = {
  cafe: { name: '朵朵咖啡馆', position: [260, 350] },
  home: { name: '居民小屋', position: [400, 475] },
  florist: { name: '木木花店', position: [260, 220] },
  school: { name: '耳语小学', position: [685, 200] },
  post: { name: '邮筒旁', position: [490, 255] },
  workshop: { name: '自行车修理铺', position: [365, 140] },
  library: { name: '镇图书馆', position: [755, 360] },
  press: { name: '社区报社', position: [640, 480] },
  square: { name: '喷泉广场', position: [420, 310] },
};

const HOMES = {
  lin: 'cafe',
  mei: 'home',
  zhou: 'florist',
  qiao: 'school',
  tang: 'post',
  chen: 'workshop',
  xu: 'library',
  bo: 'press',
  ...Object.fromEntries(RESIDENTS.map((p) => [p.id, p.home])),
};
export const HOME_POSITIONS = Object.fromEntries(
  RESIDENTS.map(({ id }) => [id, PLACES[HOMES[id]].position]),
);

const ROUTINES = {
  lin: [
    ['cafe', '在咖啡馆准备咖啡'],
    ['square', '去广场透透气'],
    ['cafe', '回咖啡馆招呼客人'],
  ],
  mei: [
    ['home', '在家整理孩子的书包'],
    ['cafe', '去咖啡馆买点心'],
    ['school', '去学校了解明天的安排'],
  ],
  zhou: [
    ['florist', '在花店照料鲜花'],
    ['post', '去邮筒旁寄一张卡片'],
    ['florist', '回花店整理花束'],
  ],
  qiao: [
    ['school', '在学校准备明天的课程'],
    ['library', '去图书馆找教学资料'],
    ['school', '回学校整理教案'],
  ],
  tang: [
    ['post', '在邮筒旁整理旧信件'],
    ['square', '去广场散步'],
    ['library', '去图书馆看报'],
  ],
  chen: [
    ['workshop', '在修理铺检查自行车'],
    ['cafe', '去咖啡馆休息一会儿'],
    ['workshop', '回修理铺继续工作'],
  ],
  xu: [
    ['library', '在图书馆整理归还的书'],
    ['school', '去学校送书'],
    ['library', '回图书馆整理书架'],
  ],
  bo: [
    ['press', '在报社整理采访笔记'],
    ['square', '去广场寻找新鲜事'],
    ['cafe', '去咖啡馆听听邻里消息'],
  ],
};

// Authored walkable links between entrances and public paths; no building collision inference.
const NODES = {
  ...Object.fromEntries(Object.entries(PLACES).map(([id, place]) => [id, place.position])),
  north: [320, 180],
  lane: [315, 265],
  cafeEast: [325, 350],
  south: [470, 400],
  westBridge: [535, 245],
  eastBridge: [605, 235],
  eastLane: [705, 300],
  eastSouth: [725, 430],
};
const EDGES = [
  ['workshop', 'north'],
  ['florist', 'north'],
  ['north', 'lane'],
  ['lane', 'square'],
  ['cafe', 'cafeEast'],
  ['cafeEast', 'square'],
  ['square', 'post'],
  ['square', 'south'],
  ['south', 'home'],
  ['post', 'westBridge'],
  ['westBridge', 'eastBridge'],
  ['eastBridge', 'school'],
  ['eastBridge', 'eastLane'],
  ['eastLane', 'library'],
  ['library', 'eastSouth'],
  ['eastSouth', 'press'],
];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const nearest = (point) =>
  Object.keys(NODES).sort((a, b) => distance(point, NODES[a]) - distance(point, NODES[b]))[0];

export function findRoute(from, to) {
  if (distance(from, to) < 1) return [[...from], [...to]];
  const start = nearest(from),
    finish = nearest(to);
  const costs = { [start]: 0 },
    previous = {},
    visited = new Set();
  while (!visited.has(finish)) {
    const node = Object.keys(costs)
      .filter((id) => !visited.has(id))
      .sort((a, b) => costs[a] - costs[b])[0];
    if (!node) break;
    visited.add(node);
    for (const edge of EDGES.filter((pair) => pair.includes(node))) {
      const next = edge.find((id) => id !== node);
      const cost = costs[node] + distance(NODES[node], NODES[next]);
      if (cost < (costs[next] ?? Infinity)) {
        costs[next] = cost;
        previous[next] = node;
      }
    }
  }
  const ids = [finish];
  while (ids[0] !== start && previous[ids[0]]) ids.unshift(previous[ids[0]]);
  return [[...from], ...ids.map((id) => [...NODES[id]]), [...to]];
}

export function sampleRoute(route, progress) {
  const lengths = route.slice(1).map((point, index) => distance(route[index], point));
  let remaining =
    lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, progress));
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] && lengths[i] > 0) {
      const t = remaining / lengths[i];
      return [
        route[i][0] + (route[i + 1][0] - route[i][0]) * t,
        route[i][1] + (route[i + 1][1] - route[i][1]) * t,
      ];
    }
    remaining -= lengths[i];
  }
  return [...route.at(-1)];
}

export function createVillage() {
  return Object.fromEntries(
    RESIDENTS.map(({ id }) => [id, { place: HOMES[id], position: [...HOME_POSITIONS[id]] }]),
  );
}

export function planActivities(game, conversations = []) {
  const current = game.village || createVillage();
  const slot = Math.floor(game.round / 2) % 3;
  const tasks = Object.fromEntries(
    RESIDENTS.map(({ id }) => {
      const [place, action] = (ROUTINES[id] || [
        [HOMES[id], '日常工作'],
        ['cafe', '休息与交谈'],
        ['square', '散步'],
      ])[slot];
      const from = current[id].position,
        to = PLACES[place].position;
      return [
        id,
        {
          id,
          place,
          fromPlace: current[id].place,
          from,
          to,
          route: findRoute(from, to),
          action,
          kind: 'routine',
          partner: null,
        },
      ];
    }),
  );
  for (const conversation of conversations) {
    const { sender, receiver } = conversation;
    const target = current[receiver];
    const destination = [
      Math.max(15, target.position[0] - 25),
      Math.min(535, target.position[1] + 4),
    ];
    tasks[sender] = {
      id: sender,
      place: target.place,
      fromPlace: current[sender].place,
      from: current[sender].position,
      to: destination,
      route: findRoute(current[sender].position, destination),
      action: `找${RESIDENTS.find(({ id }) => id === receiver).name}聊聊学校的消息`,
      kind: 'speaker',
      partner: receiver,
      conversation,
    };
    tasks[receiver] = {
      id: receiver,
      place: target.place,
      fromPlace: target.place,
      from: target.position,
      to: target.position,
      route: [target.position, target.position],
      action: `听${RESIDENTS.find(({ id }) => id === sender).name}说学校的消息`,
      kind: 'listener',
      partner: sender,
      conversation,
    };
  }
  return tasks;
}

export function finishActivities(tasks) {
  return Object.fromEntries(
    Object.entries(tasks).map(([id, task]) => [id, { place: task.place, position: [...task.to] }]),
  );
}

export function describeActivity(task, progress = 0) {
  if (task.partner && progress >= 0.72)
    return `正在和${RESIDENTS.find(({ id }) => id === task.partner).name}聊天`;
  if (task.kind === 'listener') return `${PLACES[task.place].name} · 等邻居过来`;
  if (progress < 0.72 && distance(task.from, task.to) > 1) return `前往${PLACES[task.place].name}`;
  return task.action;
}

export const validPosition = (position) =>
  Array.isArray(position) &&
  position.length === 2 &&
  position.every(
    (value, index) => Number.isFinite(value) && value >= 0 && value <= (index === 0 ? 860 : 550),
  );

export function validVillage(village) {
  return (
    village &&
    Object.keys(village).length === RESIDENTS.length &&
    RESIDENTS.every(({ id }) => {
      const location = village[id];
      return (
        location &&
        PLACES[location.place] &&
        Array.isArray(location.position) &&
        location.position.length === 2 &&
        location.position.every(
          (value, index) =>
            Number.isFinite(value) && value >= 0 && value <= (index === 0 ? 860 : 550),
        )
      );
    })
  );
}
