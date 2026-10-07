import { useState, type ReactNode } from 'react';
import { matches } from '../lib/format';

export interface Column<T> {
  key: string;
  label: string;                             // en-tête ; sert aussi d'étiquette sur mobile (data-label)
  render: (row: T) => ReactNode;
  /** Active un filtre dans la ligne de filtres. value = texte comparé (contient, insensible à la casse). */
  filter?: { value: (row: T) => unknown; placeholder?: string; options?: string[] /* liste déroulante, égalité stricte */ };
  className?: string;                        // ex. 'mono', 'num'
  nowrap?: boolean;
}
export interface TableFilters<T> { filters: Record<string, string>; setFilter: (key: string, v: string) => void; filtered: T[] }
/** État des filtres + lignes filtrées. À appeler dans la page pour connaître le nombre de lignes filtrées (compteur, totaux). */
export function useTableFilters<T>(rows: T[], columns: Column<T>[]): TableFilters<T> {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const filtered = rows.filter(r => columns.every(c => {
    const v = filters[c.key]; if (!c.filter || !v) return true;
    return c.filter.options ? String(c.filter.value(r) ?? '') === v : matches(c.filter.value(r), v);
  }));
  return { filters, setFilter: (k, v) => setFilters(f => ({ ...f, [k]: v })), filtered };
}

interface Props<T> {
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Résultat de useTableFilters(rows, columns). */
  tf: TableFilters<T>;
  /** Double-clic sur une ligne (hors boutons) — typiquement l'ouverture du formulaire de modification. */
  onRowDoubleClick?: (row: T) => void;
  emptyText?: string;
  /** Lignes supplémentaires (<tr>…) après les données, ex. ligne de total. */
  footer?: ReactNode;
}
/** Tableau avec ligne de filtres ; devient une liste de cartes sur mobile (data-label), comme le prototype. */
export function DataTable<T>({ columns, rowKey, tf, onRowDoubleClick, emptyText = 'Aucun élément ne correspond aux filtres.', footer }: Props<T>) {
  const { filters: f, setFilter, filtered } = tf;
  const hasFilters = columns.some(c => c.filter);
  return (
    <div className="table-wrap"><table>
      <thead>
        <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        {hasFilters && <tr className="filter-row">{columns.map(c => (
          <th key={c.key}>{c.filter && (c.filter.options
            ? <select value={f[c.key] || ''} onChange={e => setFilter(c.key, e.target.value)}>
                <option value="">{c.filter.placeholder || 'Tous'}</option>{c.filter.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            : <input placeholder={c.filter.placeholder || c.label} value={f[c.key] || ''} onChange={e => setFilter(c.key, e.target.value)} />)}</th>
        ))}</tr>}
      </thead>
      <tbody>
        {filtered.length ? filtered.map(r => (
          <tr key={rowKey(r)} title={onRowDoubleClick ? 'Double-cliquer pour modifier' : undefined}
            onDoubleClick={onRowDoubleClick ? (e => { if (!(e.target as HTMLElement).closest('button')) onRowDoubleClick(r); }) : undefined}>
            {columns.map(c => (
              <td key={c.key} data-label={c.label || undefined} className={c.className} style={c.nowrap ? { whiteSpace: 'nowrap' } : undefined}>{c.render(r)}</td>
            ))}
          </tr>
        )) : <tr><td colSpan={columns.length}><div className="empty-state">{emptyText}</div></td></tr>}
        {footer}
      </tbody>
    </table></div>
  );
}
