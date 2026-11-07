import { RESIDENTS, residentById } from '../simulation/scenario.js';
export const CHARACTER_SOURCES = [...new Set(['player', ...RESIDENTS.map((p) => p.sprite)])];
const variants = new WeakMap(),
  loading = new Map();
export function characterSheet(image, id) {
  const person = residentById(id);
  if (!person?.hue) return image;
  if (!variants.has(image)) variants.set(image, new Map());
  const cache = variants.get(image);
  if (cache.has(id)) return cache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = 144;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0, 144, 192);
  const bitmap = ctx.getImageData?.(0, 0, 144, 192);
  if (bitmap?.data) {
    const angle = (person.hue * Math.PI) / 180,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    for (let y = 0; y < 192; y++)
      for (let x = 0; x < 144; x++) {
        const localY = y % 48,
          localX = x % 48,
          i = (y * 144 + x) * 4;
        if (localY < 22 || localY > 42 || localX < 16 || localX > 33 || bitmap.data[i + 3] < 100)
          continue;
        const r = bitmap.data[i],
          g = bitmap.data[i + 1],
          b = bitmap.data[i + 2];
        if (Math.max(r, g, b) - Math.min(r, g, b) < 22) continue;
        const channels = [
          (0.213 + 0.787 * cos - 0.213 * sin) * r +
            (0.715 - 0.715 * cos - 0.715 * sin) * g +
            (0.072 - 0.072 * cos + 0.928 * sin) * b,
          (0.213 - 0.213 * cos + 0.143 * sin) * r +
            (0.715 + 0.285 * cos + 0.14 * sin) * g +
            (0.072 - 0.072 * cos - 0.283 * sin) * b,
          (0.213 - 0.213 * cos - 0.787 * sin) * r +
            (0.715 - 0.715 * cos + 0.715 * sin) * g +
            (0.072 + 0.928 * cos + 0.072 * sin) * b,
        ];
        for (let c = 0; c < 3; c++)
          bitmap.data[i + c] = Math.max(0, Math.min(255, Math.round(channels[c])));
      }
    ctx.putImageData(bitmap, 0, 0);
  }
  cache.set(id, canvas);
  return canvas;
}
export function loadCharacterSheet(id) {
  const source = residentById(id)?.sprite || id;
  if (!loading.has(source))
    loading.set(
      source,
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => {
          loading.delete(source);
          reject(new Error('Character art unavailable'));
        };
        image.src = `/pixel/characters/${source}.png`;
      }),
    );
  return loading.get(source).then((image) => characterSheet(image, id));
}
