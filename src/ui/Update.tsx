import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';

let doUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();
let pending = false;
let registration: ServiceWorkerRegistration | null = null;

// Enregistrement du service worker + recherche de mise à jour régulière
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  doUpdate = registerSW({
    immediate: true,
    // Nouvelle version trouvée : on l'applique tout de suite (le projet est enregistré en continu sur l'appareil)
    onNeedRefresh() { pending = true; listeners.forEach((f) => f()); window.setTimeout(() => doUpdate?.(true), 800); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      registration = reg;
      const check = () => { if (navigator.onLine) reg.update().catch(() => undefined); };
      window.setInterval(check, 20 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('online', check);
    },
  });
}

/** Recherche manuelle d'une nouvelle version (bouton du guide). */
export async function checkForUpdate(): Promise<'new' | 'none' | 'offline' | 'unsupported'> {
  if (!registration) return 'unsupported';
  if (!navigator.onLine) return 'offline';
  try { await registration.update(); } catch { return 'offline'; }
  await new Promise((r) => window.setTimeout(r, 2500));
  return pending || registration.waiting || registration.installing ? 'new' : 'none';
}
/** Applique la nouvelle version tout de suite. */
export function applyUpdate() { doUpdate?.(true); window.setTimeout(() => window.location.reload(), 1500); }

export const appVersion = () => new Date(__APP_VERSION__).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Bouton « Rechercher une mise à jour » (le bandeau peut tarder : l'application ne vérifie que toutes les 20 min ou au retour sur l'écran). */
export function UpdateCheck() {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="updcheck">
      <button className="btn sm" disabled={busy} onClick={async () => {
        setBusy(true); setMsg('Recherche…');
        const r = await checkForUpdate();
        setBusy(false);
        if (r === 'new') { setMsg('Nouvelle version trouvée : mise à jour…'); applyUpdate(); }
        else setMsg(r === 'none' ? 'Vous avez déjà la dernière version.' : r === 'offline' ? 'Pas de connexion internet.' : 'Rechargez la page pour obtenir la dernière version.');
      }}><RefreshCw size={14} aria-hidden /> Rechercher une mise à jour</button>
      {msg && <small> {msg}</small>}
    </span>
  );
}

/** Bandeau « nouvelle version disponible ». */
export function UpdateBanner() {
  const [show, setShow] = useState(pending);
  useEffect(() => { const f = () => setShow(true); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  if (!show) return null;
  return (
    <div className="updbanner" role="status">
      <RefreshCw size={16} aria-hidden />
      <span>Une nouvelle version de l'application est disponible.</span>
      <button className="btn primary sm" onClick={applyUpdate}>Mettre à jour</button>
    </div>
  );
}
