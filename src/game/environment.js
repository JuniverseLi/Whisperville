import { TILE } from './map.js';
import { PALETTE_RGB, cleanPixelClusters } from './landscape.js';

const colorCache = new Map();
function sceneColor(red, green, blue) {
  const key = ((red >> 3) << 10) | ((green >> 3) << 5) | (blue >> 3);
  if (colorCache.has(key)) return colorCache.get(key);
  let closest = PALETTE_RGB[0],
    best = Infinity;
  for (const color of PALETTE_RGB) {
    const score =
      (color[0] - red) ** 2 * 0.8 + (color[1] - green) ** 2 + (color[2] - blue) ** 2 * 0.7;
    if (score < best) {
      best = score;
      closest = color;
    }
  }
  colorCache.set(key, closest);
  return closest;
}

export const ENVIRONMENT_ASSETS = {
  buildings: '/pixel/environment/buildings-v2.png',
  props: '/pixel/environment/props-v2.png',
  terrain: '/pixel/environment/terrain-v3.png',
};
export const BUILDING_FRAMES = {
  florist: 0,
  workshop: 1,
  school: 2,
  cafe: 3,
  post: 4,
  library: 5,
  home: 6,
  press: 7,
};

// Find each sprite inside its own cell. Generated originals remain unchanged on disk.
export function createAtlas(image, columns, rows) {
  const frames = [];
  let pixels;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    pixels = context.getImageData(0, 0, image.width, image.height).data;
  } catch {
    /* The full cell is also a valid rendering fallback. */
  }
  for (let row = 0; row < rows; row++)
    for (let column = 0; column < columns; column++) {
      const left = Math.floor((column * image.width) / columns),
        top = Math.floor((row * image.height) / rows);
      const right = Math.floor(((column + 1) * image.width) / columns),
        bottom = Math.floor(((row + 1) * image.height) / rows);
      let minX = right,
        minY = bottom,
        maxX = left,
        maxY = top;
      if (pixels)
        for (let y = top; y < bottom; y++)
          for (let x = left; x < right; x++) {
            if (pixels[(y * image.width + x) * 4 + 3] < 48) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
      frames.push(
        pixels && maxX > minX
          ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
          : { x: left, y: top, w: right - left, h: bottom - top },
      );
    }
  return { image, frames, cache: new Map() };
}

export function drawAtlas(ctx, atlas, frameIndex, x, y, width, height) {
  const frame = atlas?.frames[frameIndex];
  if (!frame) return false;
  const key = `${frameIndex}:${width}:${height}`;
  let sprite = atlas.cache.get(key);
  if (!sprite) {
    sprite = document.createElement('canvas');
    // Keep the same one-world-pixel sampling density as the ground and character layers.
    sprite.width = Math.max(1, Math.round(width));
    sprite.height = Math.max(1, Math.round(height));
    const context = sprite.getContext('2d');
    context.imageSmoothingEnabled = false;
    context.drawImage(
      atlas.image,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      0,
      0,
      sprite.width,
      sprite.height,
    );
    // Remove soft alpha fringes and keep the game-sized sprite on a restrained color grid.
    const bitmap = context.getImageData?.(0, 0, sprite.width, sprite.height);
    if (bitmap?.data) {
      for (let i = 0; i < bitmap.data.length; i += 4) {
        if (bitmap.data[i + 3] < 120) {
          bitmap.data[i + 3] = 0;
          continue;
        }
        bitmap.data[i + 3] = 255;
        const color = sceneColor(bitmap.data[i], bitmap.data[i + 1], bitmap.data[i + 2]);
        for (let channel = 0; channel < 3; channel++) bitmap.data[i + channel] = color[channel];
      }
      cleanPixelClusters(bitmap.data, sprite.width, sprite.height);
      context.putImageData(bitmap, 0, 0);
    }
    atlas.cache.set(key, sprite);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(sprite, Math.round(x), Math.round(y), width, height);
  return true;
}

export function drawEnvironmentProp(ctx, p, atlas) {
  if (!atlas) return false;
  if (p.kind === 'garden') {
    for (let row = 0; row < p.h; row += 1.5)
      for (let col = 0; col < p.w; col += 2) {
        drawAtlas(ctx, atlas, 3, p.x * TILE + col * TILE - 1, (p.y + row) * TILE - 8, 33, 28);
      }
    return true;
  }
  let index, width, height;
  const w = p.w * TILE,
    h = p.h * TILE;
  if (p.kind === 'tree') {
    index = p.color === 'autumn' ? 2 : (p.x * 7 + p.y) % 5 === 0 ? 1 : 0;
    width = 60;
    height = 70;
  } else if (p.kind === 'shrub') {
    index = 3;
    width = 30;
    height = 24;
  } else if (p.kind === 'plant') {
    index = 3;
    width = 22;
    height = 26;
  } else if (p.kind === 'flowers') {
    index = 4;
    width = w + 4;
    height = 26;
  } else if (p.kind === 'bench') {
    index = 5;
    width = w + 6;
    height = 26;
  } else if (p.kind === 'lamp') {
    index = 6;
    width = 24;
    height = 49;
  } else if (p.kind === 'fountain') {
    index = 7;
    width = 64;
    height = 64;
  } else if (p.kind === 'counter' && p.w >= 6) {
    index = 8;
    width = Math.min(w, 64);
    height = 43;
  } else if (p.kind === 'table') {
    index = 9;
    width = w + 8;
    height = h + 17;
  } else if (p.kind === 'shelf') {
    index = 10;
    width = w + 4;
    height = h + 18;
  } else if (p.kind === 'desk') {
    index = 11;
    width = w + 4;
    height = h + 18;
  } else if (p.kind === 'bed') {
    index = 12;
    width = w + 4;
    height = h + 10;
  } else if (p.kind === 'crate') {
    index = 13;
    width = w + 4;
    height = h + 17;
  } else if (p.kind === 'mailbox') {
    index = 14;
    width = 22;
    height = 34;
  } else if (p.kind === 'fence') {
    index = 15;
    width = w + 4;
    height = 23;
  } else if (p.kind === 'coffee')
    return true; // Included in the café counter artwork.
  else return false;
  drawAtlas(
    ctx,
    atlas,
    index,
    p.x * TILE + w / 2 - width / 2,
    (p.y + p.h) * TILE - height + 3,
    width,
    height,
  );
  return true;
}

export function roofOpacity(building, player, cutaway = false) {
  if (cutaway) return 0;
  const x = player.x / TILE,
    y = player.y / TILE;
  if (
    x >= building.x &&
    x < building.x + building.w &&
    y >= building.y &&
    y < building.y + building.h
  )
    return 0;
  const doorX = (building.x + Math.floor(building.w / 2) + 1) * TILE,
    doorY = (building.y + building.h) * TILE;
  return Math.min(1, Math.max(0, (Math.hypot(player.x - doorX, player.y - doorY) - 24) / 40));
}
