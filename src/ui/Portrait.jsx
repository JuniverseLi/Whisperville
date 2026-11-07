import { characterImage } from './characters.js';

export default function Portrait({ resident, size = 40 }) {
  return (
    <span
      className={`portrait portrait-${resident.id}`}
      style={{ width: size, height: size, '--portrait-color': resident.color }}
      aria-hidden="true"
    >
      <img src={characterImage(resident.id)} alt="" decoding="async" draggable="false" />
    </span>
  );
}
