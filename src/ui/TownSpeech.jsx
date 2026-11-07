import { useState } from 'react';
import { ChevronRight, MessageCircle, X } from 'lucide-react';
import { layoutSpeechBubbles } from '../game/speech.js';
import { messageText, personText } from '../i18n.js';
import { useLanguage } from './Language.jsx';
import './speech.css';

export default function TownSpeech({ speeches = [], surface, onRead, onDismiss, onLocate }) {
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState(null);
  if (!surface || !speeches.length) return null;
  const visible = speeches.filter(
    (speech) =>
      speech.visible &&
      speech.x >= 0 &&
      speech.x <= surface.width &&
      speech.y >= 0 &&
      speech.y <= surface.height,
  );
  const current = visible.findIndex((speech) => speech.message.id === selected);
  const ordered = current > 0 ? [...visible.slice(current), ...visible.slice(0, current)] : visible;
  const cards = layoutSpeechBubbles(ordered, surface.width, surface.height);
  const name = (id) => personText(id, 'name', language);
  const compact = surface.width <= 700;
  const small = surface.height < 170;
  return (
    <section
      className="town-speech-layer"
      aria-label={t('地图对话', 'Map conversations')}
      style={surface}
    >
      {!small && (
        <svg
          className="town-speech-connectors"
          width={surface.width}
          height={surface.height}
          aria-hidden="true"
        >
          {cards.map((card) => (
            <g key={card.message.id}>
              <path
                d={`M ${Math.max(card.left + 12, Math.min(card.left + card.width - 12, card.x))} ${card.top + card.height / 2} L ${card.x} ${card.y}`}
              />
              <circle cx={card.x} cy={card.y} r="4" />
            </g>
          ))}
        </svg>
      )}
      {!small &&
        cards.map((card) => {
          const message = card.message;
          return (
            <article
              className={`town-speech-card ${message.kind === 'chat' ? 'is-chat' : message.evidence ? 'is-evidence' : 'is-retelling'}`}
              key={message.id}
              data-message-id={message.id}
              style={{ left: card.left, top: card.top, width: card.width, height: card.height }}
            >
              <div className="town-speech-heading">
                <MessageCircle size={13} aria-hidden="true" />
                <strong>
                  {name(message.sender)} <span>→ {name(message.receiver)}</span>
                </strong>
                {message.dialogue && (
                  <small className="speech-turn-count">
                    {message.dialogue.turn + 1}/{message.dialogue.total}
                  </small>
                )}
                <button
                  className="town-speech-dismiss"
                  onClick={() => onDismiss(message.id)}
                  aria-label={
                    message.dialogue
                      ? t('下一句对话', 'Next dialogue turn')
                      : t('收起这段对话', 'Dismiss this conversation')
                  }
                >
                  {message.dialogue ? <ChevronRight size={14} /> : <X size={14} />}
                </button>
              </div>
              <button
                className="town-speech-read"
                onClick={() => onRead(message.id)}
                aria-label={t(
                  `查看${name(message.sender)}对${name(message.receiver)}说的话`,
                  `Read ${name(message.sender)} speaking to ${name(message.receiver)}`,
                )}
              >
                <p>{messageText(message, language)}</p>
                <span className="town-speech-caption">
                  <span>
                    {message.kind === 'chat'
                      ? t('日常闲聊', 'Everyday chat')
                      : message.evidence
                        ? t('可靠消息', 'Source-backed')
                        : t('消息转述', 'Retelling')}{' '}
                    · {message.mode === 'ai' ? 'API' : t('规则', 'Rules')}
                  </span>
                  <span>
                    {t('查看全文', 'Read more')} <ChevronRight size={12} />
                  </span>
                </span>
              </button>
              {compact && visible.length > 1 && (
                <button
                  className="town-speech-next"
                  onClick={() => setSelected(ordered[1].message.id)}
                >
                  {Math.max(0, current) + 1} / {visible.length} ·{' '}
                  {t('下一段对话', 'Next conversation')} <ChevronRight size={12} />
                </button>
              )}
            </article>
          );
        })}
      {(visible.length < speeches.length || small) && (
        <button
          className="town-speech-locate"
          onClick={() =>
            small
              ? onRead(speeches[0].message.id)
              : onLocate(
                  (speeches.find((speech) => !visible.includes(speech)) || speeches[0]).message
                    .sender,
                )
          }
        >
          <MessageCircle size={15} />
          {small
            ? t('查看本段对话', 'Read conversations')
            : t(
                `${speeches.length - visible.length} 段对话在别处 · 去现场`,
                `${speeches.length - visible.length} conversations elsewhere · Locate`,
              )}
          <ChevronRight size={14} />
        </button>
      )}
    </section>
  );
}
