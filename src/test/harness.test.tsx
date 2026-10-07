// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderApp } from './harness';
import { useStore } from '../data/store';

function Probe() { const { state, can } = useStore(); return <div>devis:{state.devis.length} · edit:{String(can('devis', 'modifier'))}</div>; }

describe('harness', () => {
  it('charge la démo et applique les droits du profil', async () => {
    await renderApp(<Probe />);
    expect(screen.getByText(/devis:4 · edit:true/)).toBeTruthy();
  });
  it('profil Comptable : pas de modification des devis', async () => {
    await renderApp(<Probe />, { profil: 'Comptable' });
    expect(screen.getByText(/edit:false/)).toBeTruthy();
  });
});
