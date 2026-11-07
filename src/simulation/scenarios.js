import { SCENARIO, CLAIMS } from './scenario.js';

export const SCENARIOS = [
  {
    id: 'spring-party',
    symbol: '✿',
    title: '春日茶会，谁会来？',
    titleEn: 'Who will come to the spring tea party?',
    subtitle: '林朵准备了茶点，想请邻居在 09:30 来咖啡馆坐坐。',
    subtitleEn:
      'Lin has prepared tea and treats. She hopes neighbors will visit the café at 09:30.',
    question: '邀请会传给谁？听说茶会的人，会真的赴约吗？',
    questionEn: 'Who hears the invitation, and who actually turns up?',
    fact: '今天 09:30，朵朵咖啡馆举办春日茶会，欢迎邻居来喝茶。',
    factEn: 'A spring tea party starts at Duo Café at 09:30 today. Neighbors are welcome.',
    source: '林朵的茶会邀请',
    sourceEn: 'Lin’s tea-party invitation',
    sourceHolder: 'lin',
    focus: 'lin',
    place: 'cafe',
    startRound: 3,
    activity: '去咖啡馆参加春日茶会',
    activityEn: 'Visit the café for the spring tea party',
    reason: '我收到了茶会的消息，想去看看邻居。',
    reasonEn: 'I heard about the tea party and would like to meet the neighbors.',
    claims: [
      '今天 09:30 在咖啡馆举办茶会',
      '听说今天咖啡馆有茶会',
      '大家都被邀请去咖啡馆聚会',
      '听说咖啡馆今天全天都有庆祝活动',
    ],
    claimsEn: [
      'The café hosts a tea party at 09:30 today.',
      'There may be a tea party at the café today.',
      'Everyone is invited to meet at the café.',
      'The café may be celebrating all day.',
    ],
  },
  {
    id: 'lost-cat',
    symbol: '♧',
    title: '寻找走失的栗子',
    titleEn: 'Where is Chestnut the cat?',
    subtitle: '咖啡馆有人说猫往河边跑了，花店的周木却见过它。',
    subtitleEn:
      'Someone at the café heard the cat ran toward the river. Zhou at the flower shop has seen it.',
    question: '谁会沿河寻找？可靠的线索能把大家带到花店吗？',
    questionEn: 'Who searches the river, and can a reliable clue lead them to the flower shop?',
    fact: '三花猫栗子正在木木花店休息，周木保管着项圈上的联系方式。',
    factEn: 'Chestnut is resting at Mu Flower Shop. Zhou has the contact details from its collar.',
    source: '周木的目击记录',
    sourceEn: 'Zhou’s first-hand sighting',
    sourceHolder: 'zhou',
    rumorHolder: 'lin',
    focus: 'zhou',
    place: 'florist',
    startRound: 1,
    rumor: '听说栗子往河边跑了，你见过它吗？',
    rumorEn: 'I heard Chestnut ran toward the river. Have you seen the cat?',
    activity: '去花店看看栗子和它的项圈',
    activityEn: 'Visit the flower shop to check on Chestnut',
    reason: '可靠的目击线索指向花店，我想亲自去看看。',
    reasonEn: 'A first-hand sighting points to the flower shop. I want to see for myself.',
    claims: [
      '栗子在花店休息，周木有主人的联系方式',
      '听说栗子往河边跑了',
      '栗子现在一定在河边',
      '听说栗子已经离开了小镇',
    ],
    claimsEn: [
      'Chestnut is at the flower shop; Zhou has the owner’s contact details.',
      'Chestnut may have run toward the river.',
      'Chestnut must be at the river now.',
      'Chestnut may have left town.',
    ],
  },
  {
    ...SCENARIO,
    symbol: '?',
    titleEn: 'Is school really closed tomorrow?',
    subtitleEn: 'A whisper leaves the café. Who believes it, and who checks the source?',
    question: '先跟随林朵，再看看乔安的公告如何改变邻居的判断。',
    questionEn: 'Follow Lin, then watch how Qiao’s notice changes neighbors’ beliefs.',
    sourceEn: 'School Office notice',
    sourceHolder: 'qiao',
    rumorHolder: 'lin',
    focus: 'lin',
    rumor: '听说学校明天可能停课……你听到什么消息了吗？',
    rumorEn: 'School might be closed tomorrow… Have you heard anything?',
    claims: CLAIMS.map((c) => c.text),
    claimsEn: [
      'School stays open; only the sports field is closed for maintenance.',
      'School might be closed tomorrow.',
      'School is closed tomorrow.',
      'An accident at school means it will be closed for a week.',
    ],
  },
  {
    id: 'free-day',
    symbol: '☀',
    title: '小镇自由生活',
    titleEn: 'An ordinary day in town',
    subtitle: '不预置传闻。看看 25 位邻居如何安排工作、休息与相遇。',
    subtitleEn: 'No seeded rumor. Watch 25 neighbors work, take breaks and cross paths.',
    question: '选一个人跟随，看看 TA 的下一步打算是否真的发生。',
    questionEn: 'Follow someone and see how their next intentions become real actions.',
    focus: 'mia',
    claims: [],
    claimsEn: [],
  },
];

export function getScenario(value) {
  const id = typeof value === 'string' ? value : value?.scenarioId;
  return (
    SCENARIOS.find((scene) => scene.id === id) ||
    SCENARIOS.find((scene) => scene.id === SCENARIO.id)
  );
}
