import { useEffect, useRef } from 'react';
import { loadCharacterSheet } from '../game/characters.js';
export default function CharacterPortrait({ id, label }) {
  const ref = useRef(null);
  useEffect(() => {
    let active = true;
    ref.current.dataset.ready = 'loading';
    loadCharacterSheet(id)
      .then((image) => {
        if (!active) return;
        const ctx = ref.current.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, 80, 80);
        ctx.drawImage(image, image.width / 3, 0, image.width / 3, image.height / 4, 0, 0, 80, 80);
        ref.current.dataset.ready = 'true';
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <canvas
      ref={ref}
      width="80"
      height="80"
      role="img"
      aria-label={label || id}
      className="pixel-portrait"
    />
  );
}
