/* Liste déroulante de recherche de client (sélection uniquement parmi les clients de Tiers).
   Le devis garde le NOM du client ; taper dans le champ annule la sélection tant qu'on n'a pas choisi un client. */
import { useRef, useState } from 'react';
import type { Tiers } from '../../lib/types';

interface Props {
  clients: Tiers[];
  /** Nom du client sélectionné ('' si aucune sélection). */
  value: string;
  onSelect: (client: Tiers) => void;
  /** Appelé dès que le texte est modifié (la sélection précédente n'est plus valide). */
  onClear: () => void;
  disabled?: boolean;
}
export function ClientCombo({ clients, value, onSelect, onClear, disabled }: Props) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const q = query.toLowerCase();
  const items = clients.filter(c => (c.nom || '').toLowerCase().includes(q));
  return (
    <div className="field" style={{ position: 'relative' }}>
      <label>Client</label>
      <input id="f-client-search" required autoComplete="off" placeholder="Rechercher un client…" value={query} disabled={disabled}
        onChange={e => { setQuery(e.target.value); onClear(); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { timer.current = window.setTimeout(() => setOpen(false), 150); }} />
      <div className="combo-dropdown" role="listbox" style={{ display: open && !disabled ? 'block' : 'none' }}>
        {items.length ? items.map(c => (
          <div key={c.id} className="combo-item" role="option"
            onMouseDown={e => { e.preventDefault(); window.clearTimeout(timer.current); setQuery(c.nom); onSelect(c); setOpen(false); }}>
            <strong>{c.nom}</strong><span className="combo-sub">{c.ice || ''}</span>
          </div>
        )) : <div className="combo-empty">Aucun client trouvé — ajoutez-le d'abord dans Tiers &gt; Client.</div>}
      </div>
      <div className="hint" style={{ marginTop: 2 }}>Sélection uniquement parmi les clients ajoutés dans Tiers</div>
    </div>
  );
}
