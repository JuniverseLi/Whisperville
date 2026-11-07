import { getScenario } from './simulation/scenarios.js';
import { residentById } from './simulation/scenario.js';
export const PLACE_NAMES = {
  cafe: ['朵朵咖啡馆', 'Duo Café'],
  home: ['河畔小屋', 'Riverside Home'],
  florist: ['木木花店', 'Mu Flower Shop'],
  school: ['耳语镇学校', 'Whisperville School'],
  post: ['旧邮局', 'Old Post Office'],
  workshop: ['自行车修理铺', 'Bicycle Workshop'],
  library: ['小镇图书馆', 'Town Library'],
  press: ['社区报社', 'Community Press'],
  square: ['钟楼小广场', 'Clocktower Square'],
  river: ['河畔步道', 'Riverside Walk'],
};
export function personText(id, field, language = 'zh') {
  const p = residentById(id);
  return p
    ? language === 'en'
      ? p[`${field}En`] || p[field]
      : p[field]
    : language === 'en'
      ? 'Source'
      : '消息源';
}
export function placeText(id, language = 'zh') {
  return PLACE_NAMES[id]?.[language === 'en' ? 1 : 0] || id;
}
export function messageText(message, language = 'zh') {
  return language === 'en' && message.textEn ? message.textEn : message.text;
}
export function claimText(claim, language = 'zh', game) {
  const scene = getScenario(game);
  return language === 'en' ? scene.claimsEn[claim] : scene.claims[claim];
}
