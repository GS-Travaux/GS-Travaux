import type { ReactNode } from 'react';
import { money } from '../../lib/format';

/** Titre de section du tableau de bord. */
export function DashSection({ title }: { title: string }) { return <h2 className="dash-section"><span>{title}</span></h2>; }

/** Panneau avec titre (et sous-titre) autour d'un graphique. */
export function DashPanel({ title, sub, children }: { title: string; sub?: string; children: ReactNode }) {
  return (
    <div className="panel" style={{ padding: 18 }}>
      <h2 style={{ margin: `0 0 ${sub ? 4 : 14}px`, fontSize: 14, fontWeight: 600 }}>{title}</h2>
      {sub ? <div style={{ fontSize: 11.5, color: 'var(--ink-soft)', marginBottom: 12 }}>{sub}</div> : null}
      {children}
    </div>
  );
}

/** Montant signé : « − 1 234,00 DH » pour un négatif. */
export function signed(v: number): string { return (v < 0 ? '− ' : '') + money(Math.abs(v)) + ' DH'; }

/** « Dans 5 j », « Aujourd'hui », ou le libellé donné pour le passé. */
export function delaiLabel(jours: number, retard: (n: number) => string): string {
  return jours < 0 ? retard(-jours) : jours === 0 ? "Aujourd'hui" : 'Dans ' + jours + ' j';
}
