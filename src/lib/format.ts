/* Utilitaires de formatage communs (repris du prototype). */

export function uid(p: string): string { return p + '_' + Math.random().toString(36).slice(2, 9); }

export function money(n: number | string | null | undefined): string {
  return (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

/** Échappe le HTML — à utiliser pour tout texte inséré dans une chaîne HTML (impression). */
export function esc(s: unknown): string {
  return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function todayIso(): string { return new Date().toISOString().slice(0, 10); }

export function addJours(isoDate: string, n: number): string {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMois(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString().slice(0, 10);
}

export function joursDepuisAujourdhui(iso: string): number {
  return Math.round((new Date(iso + 'T00:00:00Z').getTime() - new Date(todayIso() + 'T00:00:00Z').getTime()) / 86400000);
}

/** Filtre « contient » insensible à la casse utilisé par les tableaux. */
export function matches(val: unknown, f?: string): boolean {
  if (!f) return true;
  return (val ?? '').toString().toLowerCase().includes(f.toLowerCase());
}

export function numberToFrenchWords(n: number): string {
  n = Math.round(n);
  if (n === 0) return 'zéro dirhams';
  const units = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
  const tens = ['', 'dix', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante-dix', 'quatre-vingt', 'quatre-vingt-dix'];
  function threeDigits(num: number): string {
    let s = '';
    const h = Math.floor(num / 100), r = num % 100;
    if (h) s += (h > 1 ? units[h] + ' cent' : 'cent') + (r === 0 && h > 1 ? 's' : '') + (r ? ' ' : '');
    if (r < 20) s += units[r];
    else {
      const t = Math.floor(r / 10), u = r % 10;
      if (t === 7 || t === 9) s += tens[t - 1] + '-' + units[10 + u];
      else s += tens[t] + (u ? '-' + units[u] : '');
    }
    return s.trim();
  }
  let result = '';
  const millions = Math.floor(n / 1000000); n %= 1000000;
  const milliers = Math.floor(n / 1000); n %= 1000;
  if (millions) result += threeDigits(millions) + ' million' + (millions > 1 ? 's' : '') + ' ';
  if (milliers) result += (milliers === 1 ? 'mille' : threeDigits(milliers) + ' mille') + ' ';
  if (n) result += threeDigits(n);
  return (result.trim() || 'zéro') + ' dirhams';
}
