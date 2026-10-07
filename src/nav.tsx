import { createContext, useContext } from 'react';

export interface NavCtx {
  page: string;
  /** Va à une page (id de PAGES, ex. 'devis', 'collaborateur', 'securite'). */
  go: (pageId: string) => void;
}
export const NavContext = createContext<NavCtx>({ page: 'dashboard', go: () => {} });
export const useNav = () => useContext(NavContext);
