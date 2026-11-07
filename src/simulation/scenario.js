import { CORE_DETAILS, EXTRA_RESIDENTS } from './cast.js';

export const SCENARIO = {
  id: 'school-closure',
  title: '明天，学校真的会停课吗？',
  subtitle: '一则模糊的消息，正从街角的咖啡馆传开。',
  fact: '学校明天正常上课。操场因维护暂时关闭，教学楼照常开放。',
  factEn:
    'School is open tomorrow. Only the playground is closed for maintenance; classes continue as usual.',
  source: '耳语小学 · 校务处公告',
  maxRounds: 12,
  interventions: 3,
};

export const CLAIMS = [
  { id: 0, text: '明天正常上课，只关闭操场', short: '已知事实', color: 'green' },
  { id: 1, text: '听说明天学校可能停课', short: '尚在猜测', color: 'amber' },
  { id: 2, text: '学校明天确定停课', short: '相信流言', color: 'coral' },
  { id: 3, text: '学校出了事故，要停课一周', short: '流言失真', color: 'red' },
];

const ORIGINAL_RESIDENTS = [
  {
    id: 'lin',
    name: '林朵',
    role: '咖啡店主',
    trait: '热心健谈，消息总比咖啡先到。',
    color: '#ce8863',
    hair: '#49392e',
    skin: '#efc5a0',
    x: 220,
    y: 310,
    links: ['mei', 'zhou', 'bo'],
    caution: 0.3,
  },
  {
    id: 'mei',
    name: '许美',
    role: '学生家长',
    trait: '关心孩子，格外留意学校的风吹草动。',
    color: '#ab8aab',
    hair: '#34352e',
    skin: '#e4b490',
    x: 430,
    y: 385,
    links: ['lin', 'qiao', 'chen'],
    caution: 0.35,
  },
  {
    id: 'zhou',
    name: '周木',
    role: '花店老板',
    trait: '喜欢分享，也愿意听听不同的说法。',
    color: '#8da879',
    hair: '#5b4131',
    skin: '#ecc3a0',
    x: 155,
    y: 195,
    links: ['lin', 'tang', 'chen'],
    caution: 0.6,
  },
  {
    id: 'qiao',
    name: '乔安',
    role: '小学老师',
    trait: '习惯核对来源，不轻易下结论。',
    color: '#718fba',
    hair: '#483c35',
    skin: '#efc9aa',
    x: 620,
    y: 190,
    links: ['mei', 'xu', 'tang'],
    caution: 0.9,
  },
  {
    id: 'tang',
    name: '唐爷爷',
    role: '退休邮递员',
    trait: '认识镇上的每个人，珍惜老朋友的信任。',
    color: '#c1a16a',
    hair: '#d7d4c5',
    skin: '#ddb08c',
    x: 460,
    y: 225,
    links: ['zhou', 'qiao', 'xu'],
    caution: 0.65,
  },
  {
    id: 'chen',
    name: '陈小野',
    role: '自行车修理师',
    trait: '想到什么就说什么，偶尔会添油加醋。',
    color: '#7d9b9b',
    hair: '#343a35',
    skin: '#d9a67e',
    x: 320,
    y: 140,
    links: ['mei', 'zhou', 'bo'],
    caution: 0.2,
  },
  {
    id: 'xu',
    name: '陆书',
    role: '图书管理员',
    trait: '更相信白纸黑字，也乐于解释来龙去脉。',
    color: '#b48d75',
    hair: '#4b3630',
    skin: '#edc6a7',
    x: 720,
    y: 320,
    links: ['qiao', 'tang', 'bo'],
    caution: 0.95,
  },
  {
    id: 'bo',
    name: '阿柏',
    role: '社区记者',
    trait: '追着新鲜事跑，希望找到第一手消息。',
    color: '#a6a46d',
    hair: '#453832',
    skin: '#ddb18a',
    x: 580,
    y: 430,
    links: ['lin', 'chen', 'xu'],
    caution: 0.5,
  },
];

const core = ORIGINAL_RESIDENTS.map((person) => {
  const [nameEn, roleEn, traitEn, home, goalEn] = CORE_DETAILS[person.id];
  return { ...person, nameEn, roleEn, traitEn, home, goalEn, sprite: person.id, hue: 0 };
});
const cast = [...core, ...EXTRA_RESIDENTS];
export const RESIDENTS = cast.map((person, index) => ({
  ...person,
  links: [
    ...new Set([
      ...(person.links || []),
      ...cast.filter((p) => p.id !== person.id && p.home === person.home).map((p) => p.id),
      cast[(index + 1) % cast.length].id,
    ]),
  ],
}));

export const residentById = (id) => RESIDENTS.find((resident) => resident.id === id);
