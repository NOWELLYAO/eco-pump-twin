import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';

let doUpdate: ((reload?: boolean) => Promise<void>) | null = null;
const listeners = new Set<() => void>();
let pending = false;

// Enregistrement du service worker + recherche de mise à jour régulière
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  doUpdate = registerSW({
    immediate: true,
    onNeedRefresh() { pending = true; listeners.forEach((f) => f()); },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      const check = () => { if (navigator.onLine) reg.update().catch(() => undefined); };
      window.setInterval(check, 20 * 60 * 1000);
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') check(); });
      window.addEventListener('online', check);
    },
  });
}

export const appVersion = () => new Date(__APP_VERSION__).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Bandeau « nouvelle version disponible ». */
export function UpdateBanner() {
  const [show, setShow] = useState(pending);
  useEffect(() => { const f = () => setShow(true); listeners.add(f); return () => { listeners.delete(f); }; }, []);
  if (!show) return null;
  return (
    <div className="updbanner" role="status">
      <RefreshCw size={16} aria-hidden />
      <span>Une nouvelle version de l'application est disponible.</span>
      <button className="btn primary sm" onClick={() => { doUpdate?.(true); window.setTimeout(() => window.location.reload(), 1500); }}>Mettre à jour</button>
    </div>
  );
}
