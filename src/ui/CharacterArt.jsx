import { characterImage } from './characters.js';

export default function CharacterArt({ resident, className = '', eager = false }) {
  return (
    <img
      className={`character-art ${className}`}
      src={characterImage(resident.id)}
      alt={`${resident.name}，${resident.role}的角色立绘`}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      draggable="false"
    />
  );
}
