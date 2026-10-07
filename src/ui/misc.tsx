import { createContext, useContext, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* ── Boutons / badges / conteneurs (classes CSS du prototype) ── */
export function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 14 14"><path d="M7 1v12M1 7h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}
export function AddButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return <button className="btn btn-accent" onClick={onClick}><PlusIcon /> {children}</button>;
}
/** cls : badge-cree | badge-soldee | badge-facture | badge-annule */
export function Badge({ cls, children }: { cls: string; children: ReactNode }) {
  return <span className={'badge ' + cls}>{children}</span>;
}
export function EmptyState({ children }: { children: ReactNode }) { return <div className="empty-state">{children}</div>; }
export function Panel({ title, count, actions, children }: { title?: ReactNode; count?: number; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel">
      {title !== undefined && <div className="panel-head"><h2>{title}{count !== undefined && <> <span className="count-pill">{count}</span></>}</h2>{actions}</div>}
      {children}
    </div>
  );
}
/** Champ de formulaire : <Field label="Nom"><input .../></Field> */
export function Field({ label, hint, children }: { label?: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return <div className="field">{label !== undefined && <label>{label}</label>}{children}{hint && <div className="hint">{hint}</div>}</div>;
}

/* ── Onglets internes d'une page ── */
export interface TabDef<T extends string> { id: T; label: ReactNode; visible?: boolean }
export function SettingsTabs<T extends string>({ tabs, active, onChange }: { tabs: TabDef<T>[]; active: T; onChange: (t: T) => void }) {
  return (
    <div className="settings-tabs">
      {tabs.filter(t => t.visible !== false).map(t => (
        <button key={t.id} className={t.id === active ? 'active' : ''} onClick={() => onChange(t.id)}>{t.label}</button>
      ))}
    </div>
  );
}
/** Onglet courant s'il est visible, sinon le premier visible. */
export function pickTab<T extends string>(current: T, tabs: TabDef<T>[]): T {
  const ok = tabs.filter(t => t.visible !== false);
  return ok.some(t => t.id === current) ? current : (ok[0]?.id ?? current);
}

/* ── Boutons d'action de la barre du haut : <PageActions>…</PageActions> dans n'importe quelle page ── */
export const PageActionsTarget = createContext<HTMLElement | null>(null);
export function PageActions({ children }: { children: ReactNode }) {
  const target = useContext(PageActionsTarget);
  return target ? createPortal(children, target) : null;
}
