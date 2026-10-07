import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { subscribeToast, toast } from './toast';
import { Modal } from './Modal';

interface ConfirmOpts { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean }
interface UICtx {
  /** Affiche une fenêtre modale (un seul niveau : ouvrir une nouvelle fenêtre remplace la précédente). */
  openModal(node: ReactNode): void;
  closeModal(): void;
  /** Demande de confirmation ; résout true si l'utilisateur confirme. */
  confirm(opts: ConfirmOpts): Promise<boolean>;
}
const Ctx = createContext<UICtx | null>(null);
export function useUI(): UICtx { const c = useContext(Ctx); if (!c) throw new Error('useUI hors UIProvider'); return c; }

export function UIProvider({ children }: { children: ReactNode }) {
  const [modal, setModal] = useState<ReactNode>(null);
  const [msg, setMsg] = useState(''); const [show, setShow] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => subscribeToast(m => {
    setMsg(m); setShow(true);
    window.clearTimeout(timer.current); timer.current = window.setTimeout(() => setShow(false), 2200);
  }), []);

  const closeModal = useCallback(() => setModal(null), []);
  const openModal = useCallback((n: ReactNode) => setModal(n), []);
  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>(resolve => {
    const done = (v: boolean) => { setModal(null); resolve(v); };
    setModal(
      <Modal title={o.title} size="sm" onClose={() => done(false)}
        footer={<>
          <button className="btn btn-ghost" onClick={() => done(false)}>Annuler</button>
          <button className={'btn ' + (o.danger ? 'btn-danger' : 'btn-accent')} onClick={() => done(true)}>{o.confirmLabel || 'Confirmer'}</button>
        </>}>
        <div>{o.message}</div>
      </Modal>);
  }), []);

  const value = useMemo(() => ({ openModal, closeModal, confirm }), [openModal, closeModal, confirm]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div id="modal-root">{modal}</div>
      <div className={'toast' + (show ? ' show' : '')} id="toast" role="status">{msg}</div>
    </Ctx.Provider>
  );
}
export { toast };
