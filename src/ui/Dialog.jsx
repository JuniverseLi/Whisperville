import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from './Language.jsx';

export default function Dialog({ title, onClose, children, className = '' }) {
  const { t } = useLanguage();
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className={`dialog ${className}`}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-inner">
        <div className="dialog-heading">
          <div>
            <span className="eyebrow">WHISPERVILLE FIELD NOTES</span>
            <h2 id="dialog-title">{title}</h2>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t('关闭对话框', 'Close dialog')}
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
