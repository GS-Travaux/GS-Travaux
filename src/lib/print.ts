/* Impression / PDF : le HTML est injecté dans #print-area (hors de l'application) puis window.print(). */
import { esc } from './format';

export function printDocument(html: string) {
  const area = document.getElementById('print-area');
  if (!area) return;
  area.innerHTML = html;
  document.body.classList.add('printing');
  window.print();
  setTimeout(() => document.body.classList.remove('printing'), 300);
}
export function legalVal(x: unknown): string { const t = String(x ?? '').trim(); return (t && t !== '—' && t !== '-') ? t : ''; }
export function legalIds(s: { rc?: string; cnss?: string }): string {
  return ([['RC', legalVal(s.rc)], ['CNSS', legalVal(s.cnss)]] as const).filter(p => p[1]).map(p => `${p[0]} N° : ${esc(p[1])}`).join(' · ');
}
