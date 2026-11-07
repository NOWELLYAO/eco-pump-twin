import { useEffect, useState } from 'react';
import { Download, WifiOff, X } from 'lucide-react';

interface BIPEvent extends Event { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

export function useOnline() {
  const [on, setOn] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const up = () => setOn(true), down = () => setOn(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  return on;
}

const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Badge hors ligne + bouton d'installation sur l'écran d'accueil. */
export function OfflineAndInstall() {
  const online = useOnline();
  const [evt, setEvt] = useState<BIPEvent | null>(null);
  const [installed, setInstalled] = useState(standalone());
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setEvt(e as BIPEvent); };
    const done = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', h); window.removeEventListener('appinstalled', done); };
  }, []);
  return (
    <>
      {!online && <span className="offline" title="Pas de connexion : l'application fonctionne quand même"><WifiOff size={15} aria-hidden /><span>Hors ligne</span></span>}
      {!installed && (
        <button className="btn installbtn" onClick={async () => {
          if (evt) { await evt.prompt(); const r = await evt.userChoice; if (r.outcome === 'accepted') setInstalled(true); setEvt(null); }
          else setHelp(true);
        }} title="Installer sur l'écran d'accueil pour l'utiliser sans internet"><Download size={16} aria-hidden /><span>Installer</span></button>
      )}
      {help && (
        <div className="backdrop" onClick={() => setHelp(false)}>
          <div className="modal" role="dialog" aria-modal aria-label="Installer l'application" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Installer l'application</h2><button className="icon-btn" onClick={() => setHelp(false)} aria-label="Fermer"><X size={20} /></button></div>
            <div className="guide">
              <p>Une fois installée, l'application s'ouvre depuis l'écran d'accueil et <b>fonctionne sans internet</b> (calculs, schémas, simulation, rapport, sauvegarde de votre installation).</p>
              <p><b>Android (Chrome)</b> : menu <b>⋮</b> en haut à droite → <b>Installer l'application</b> (ou « Ajouter à l'écran d'accueil »).</p>
              <p><b>iPhone / iPad (Safari)</b> : bouton <b>Partager</b> (carré avec une flèche) → <b>Sur l'écran d'accueil</b> → <b>Ajouter</b>.</p>
              <p><b>Ordinateur (Chrome, Edge)</b> : icône d'installation dans la barre d'adresse.</p>
              <p className="muted">Ouvrez l'application une première fois avec internet : tout est alors enregistré sur l'appareil. Seules les photos réelles demandent une connexion (celles déjà vues restent disponibles).</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
