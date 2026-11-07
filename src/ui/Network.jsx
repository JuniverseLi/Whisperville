import { RESIDENTS, residentById } from '../simulation/scenario.js';
import { beliefColor } from './TownMap.jsx';
import Portrait from './Portrait.jsx';

export default function Network({ game, selected, onSelect }) {
  const positions = Object.fromEntries(
    RESIDENTS.map((resident, index) => {
      const angle = (index / RESIDENTS.length) * Math.PI * 2 - Math.PI / 2;
      return [resident.id, { x: 430 + Math.cos(angle) * 240, y: 265 + Math.sin(angle) * 185 }];
    }),
  );
  const edges = game.messages.filter((message) => residentById(message.sender));
  return (
    <div className="network-view">
      <svg viewBox="0 0 860 550" aria-label="居民消息传播关系图">
        <defs>
          <marker
            id="network-arrow"
            markerWidth="7"
            markerHeight="7"
            refX="12"
            refY="3"
            orient="auto"
          >
            <path d="M0 0 6 3 0 6" fill="none" stroke="context-stroke" strokeWidth="1.5" />
          </marker>
        </defs>
        <circle cx="430" cy="265" r="125" fill="none" stroke="#e4e7db" strokeDasharray="3 7" />
        <text x="430" y="258" textAnchor="middle" className="network-center">
          每一句话
        </text>
        <text x="430" y="284" textAnchor="middle" className="network-center">
          都有来处
        </text>
        {RESIDENTS.flatMap((resident) =>
          resident.links
            .filter((id) => id > resident.id)
            .map((id) => (
              <line
                key={`${resident.id}-${id}`}
                x1={positions[resident.id].x}
                y1={positions[resident.id].y}
                x2={positions[id].x}
                y2={positions[id].y}
                stroke="#e3e5d9"
                strokeWidth="1"
              />
            )),
        )}
        {edges.map((message, index) => {
          const from = positions[message.sender];
          const to = positions[message.receiver];
          return (
            <path
              key={message.id}
              d={`M${from.x} ${from.y} Q430 ${265 + ((index % 3) - 1) * 100} ${to.x} ${to.y}`}
              fill="none"
              stroke={message.evidence ? '#548366' : '#c39870'}
              strokeWidth="2"
              opacity={0.25 + (index / Math.max(edges.length, 1)) * 0.5}
              markerEnd="url(#network-arrow)"
            />
          );
        })}
        {RESIDENTS.map((resident) => {
          const position = positions[resident.id];
          const color = beliefColor(game.residents[resident.id]);
          return (
            <g
              key={resident.id}
              transform={`translate(${position.x} ${position.y})`}
              onClick={() => onSelect(resident.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(resident.id);
                }
              }}
              role="button"
              tabIndex="0"
              aria-label={`图谱选择${resident.name}`}
              className="network-node"
            >
              {selected === resident.id && (
                <circle r="29" fill="none" stroke={color} strokeWidth="1.5" strokeDasharray="3 3" />
              )}
              <circle r="22" fill="#faf9f2" stroke={color} strokeWidth="3" />
              <foreignObject x="-21" y="-21" width="42" height="42" pointerEvents="none">
                <Portrait resident={resident} size={42} />
              </foreignObject>
              <text textAnchor="middle" y="43" fill="#586351" fontSize="12">
                {resident.name}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="network-note">箭头记录实际转述 · 浅线表示邻里关系 · 点击居民查看信念</div>
    </div>
  );
}
