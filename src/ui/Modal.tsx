import { useEffect, type ReactNode, type RefObject } from 'react';

interface Props {
  title: string;
  size?: 'sm' | 'md';
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  /** Référence du corps de la fenêtre, à passer à validateRequired(). */
  bodyRef?: RefObject<HTMLDivElement>;
}
/** Fenêtre modale (mêmes classes CSS que le prototype). Se ferme avec Échap ou un clic à l'extérieur. */
export function Modal({ title, size, onClose, footer, children, bodyRef }: Props) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={'modal' + (size === 'sm' ? ' modal-sm' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Fermer">
            <svg width="16" height="16" viewBox="0 0 16 16"><path d="M3 3l10 10M13 3 3 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>
        <div className="modal-body" ref={bodyRef}>{children}</div>
        <div className="modal-foot">{footer}</div>
      </div>
    </div>
  );
}
