import { BUILDINGS, TILE } from './map.js';
import { getScenario } from '../simulation/scenarios.js';

export function storyObjects(game) {
  const scene = getScenario(game);
  if (!scene.place) return [];
  const room = BUILDINGS.find((b) => b.id === scene.place);
  return [
    {
      storyProp: scene.id === 'lost-cat' ? 'cat' : 'tea',
      x: (room.home[0] + 1.5) * TILE,
      y: (room.home[1] + 1.5) * TILE,
    },
  ];
}

export function drawStoryObject(ctx, object, time, language) {
  const x = Math.round(object.x),
    y = Math.round(object.y);
  const rect = (color, dx, dy, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx, y + dy, w, h);
  };
  if (object.storyProp === 'cat') {
    rect('#395d453f', -7, 0, 15, 3);
    rect('#63492f', -6, -8, 12, 8);
    rect('#e9c897', -5, -7, 10, 6);
    rect('#63492f', -5, -12, 3, 5);
    rect('#63492f', 2, -12, 3, 5);
    rect('#e9c897', -4, -11, 1, 3);
    rect('#e9c897', 3, -11, 1, 3);
    rect('#b5793f', -4, -7, 4, 3);
    rect('#eee6c4', 1, -5, 3, 4);
    rect('#314d34', -3, -6, 1, 1);
    rect('#314d34', 2, -6, 1, 1);
    rect('#c58e79', 0, -4, 1, 1);
    rect('#c29456', 6, -5, 2, 5);
    rect('#c29456', 7, -(6 + (Math.floor(time) % 2)), 3, 2);
  } else {
    rect('#6b4830', -13, -15, 26, 15);
    rect('#fae2a2', -12, -14, 24, 12);
    rect('#bf7854', -8, -11, 5, 2);
    rect('#718c52', 3, -11, 5, 2);
    rect('#6b4830', -7, -6, 14, 1);
    ctx.fillStyle = '#6b4830';
    ctx.font = '5px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('09:30', x, y - 8);
  }
  ctx.font = '7px Microsoft YaHei,sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff2ca';
  const label =
    object.storyProp === 'cat'
      ? language === 'en'
        ? 'Chestnut'
        : '栗子'
      : language === 'en'
        ? 'Spring tea'
        : '春日茶会';
  const width = ctx.measureText(label).width + 6;
  ctx.fillRect(x - width / 2, y + 5, width, 10);
  ctx.fillStyle = '#6b4830';
  ctx.fillText(label, x, y + 12);
  ctx.textAlign = 'left';
}
