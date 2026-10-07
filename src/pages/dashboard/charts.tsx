/* Graphiques SVG du tableau de bord (sans dépendance) : histogramme, anneau, barres horizontales. */
import { money } from '../../lib/format';

export interface BarDatum { label: string; value: number }

export function BarChart({ data, width = 560, height = 200 }: { data: BarDatum[]; width?: number; height?: number }) {
  const padL = 46, padB = 28, padT = 12, padR = 10;
  const max = Math.max(1, ...data.map(d => d.value));
  const barW = (width - padL - padR) / data.length;
  const scaleY = (v: number) => (height - padB - padT) * (v / max);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Chiffre d'affaires facturé par mois">
      {[0, 0.25, 0.5, 0.75, 1].map(f => {
        const y = padT + (height - padB - padT) * (1 - f);
        return <line key={f} x1={padL} x2={width - padR} y1={y.toFixed(1)} y2={y.toFixed(1)} style={{ stroke: 'var(--border)' }} strokeWidth={1} />;
      })}
      {data.map((d, i) => {
        const bh = scaleY(d.value);
        const x = padL + i * barW + barW * 0.18;
        const bw = barW * 0.64;
        const y = height - padB - bh;
        return (
          <g key={i}>
            <rect x={x.toFixed(1)} y={y.toFixed(1)} width={bw.toFixed(1)} height={bh.toFixed(1)} rx={4} style={{ fill: 'var(--primary-2)' }} />
            <text x={(x + bw / 2).toFixed(1)} y={(y - 5).toFixed(1)} fontSize={10.5} textAnchor="middle" style={{ fill: 'var(--ink-soft)', fontFamily: 'var(--font-m)' }}>{d.value ? money(d.value) : ''}</text>
            <text x={(x + bw / 2).toFixed(1)} y={height - 10} fontSize={10.5} textAnchor="middle" style={{ fill: 'var(--ink-soft)' }}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export interface DonutDatum { label: string; value: number; color: string }

/** Anneau + légende (libellé, effectif). */
export function Donut({ data, size = 170, label }: { data: DonutDatum[]; size?: number; label?: string }) {
  const stroke = 26, r = (size - stroke) / 2, c = size / 2;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const circumference = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: size, height: size, flex: 'none' }} role="img" aria-label={label}>
        {data.map(d => {
          const frac = d.value / total;
          const dash = frac * circumference, offset = circumference - acc * circumference;
          acc += frac;
          return (
            <circle key={d.label} cx={c} cy={c} r={r} fill="none" style={{ stroke: d.color }} strokeWidth={stroke}
              strokeDasharray={`${dash.toFixed(1)} ${circumference.toFixed(1)}`} strokeDashoffset={offset.toFixed(1)} transform={`rotate(-90 ${c} ${c})`} />
          );
        })}
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {data.map(d => (
          <div key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: d.color, flex: 'none' }} />
            {d.label} <span className="mono" style={{ color: 'var(--ink-soft)' }}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface HBarItem { label: string; value: number; color?: string }

export function HBars({ items, fmt = (v: number) => String(v) }: { items: HBarItem[]; fmt?: (v: number) => string }) {
  if (!items.length || items.every(i => !i.value)) return <div className="empty-state" style={{ padding: '22px 0' }}>Aucune donnée sur la période.</div>;
  const max = Math.max(1, ...items.map(i => i.value));
  return (
    <div className="hbars">
      {items.map(i => (
        <div className="hbar" key={i.label}>
          <div className="hbar-label" title={i.label}>{i.label}</div>
          <div className="hbar-track"><div className="hbar-fill" style={{ width: `${(i.value ? Math.max(2, i.value / max * 100) : 0).toFixed(1)}%`, ...(i.color ? { background: i.color } : {}) }} /></div>
          <div className="hbar-val">{fmt(i.value)}</div>
        </div>
      ))}
    </div>
  );
}
