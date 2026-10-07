/* Message bref en bas de l'écran. Utilisable depuis n'importe où (le composant <ToastHost/> l'affiche). */
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();
export function toast(msg: string) { listeners.forEach(l => l(msg)); }
export function subscribeToast(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; }
