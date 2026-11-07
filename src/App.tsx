import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ClipboardCheck, FilePlus2, FlaskConical, Package, PencilRuler, Printer, Stethoscope, X } from 'lucide-react';
import { APPS } from './installer/catalog';
import { evaluate } from './installer/evaluate';
import { ensureElec } from './installer/electrical';
import { PRESETS, empty } from './installer/presets';
import { targetsOf } from './installer/targets';
import type { AppId, Installation, Issue } from './installer/types';
import { OfflineAndInstall } from './ui/Offline';
import { UpdateBanner, appVersion } from './ui/Update';
import { DesignPage, DiagPage, MaterialPage, SimPage, type Shared } from './installer/ui/Pages';
import { CommissionPage, CommissionResults } from './installer/ui/CommissionPage';
import { PidView } from './installer/ui/PidView';
import { Alerts, Bom, ElecCard, Goods, KeyFigures, LossTable, MountOrder, PartsAtRisk, Recommendations, ScoreCard } from './installer/ui/Report';

type Page = 'design' | 'sim' | 'diag' | 'com' | 'mat';
const PAGES: { id: Page; label: string; icon: typeof PencilRuler }[] = [
  { id: 'design', label: 'Conception', icon: PencilRuler },
  { id: 'sim', label: 'Simulation', icon: FlaskConical },
  { id: 'diag', label: 'Diagnostic', icon: Stethoscope },
  { id: 'com', label: 'Mise en service', icon: ClipboardCheck },
  { id: 'mat', label: 'Matériel & rapport', icon: Package },
];
const KEY = 'ecopump-installer-v1';

function load(): Installation {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return ensureElec(JSON.parse(raw) as Installation);
  } catch { /* ignore */ }
  return PRESETS[3].build();
}

function Guide() {
  return (
    <div className="guide">
      <p><b>Conception</b> : décrivez l'installation étape par étape (ou partez d'un exemple). La vue réelle, le schéma P&ID et la note se mettent à jour à chaque saisie.</p>
      <p><b>Simulation</b> : mettez la pompe en marche ou à l'arrêt, faites défiler le temps et jouez sur la vanne, la vitesse, le niveau d'eau, le colmatage ou l'usure. Les instruments, les courbes, les alertes et le journal des événements réagissent en direct.</p>
      <p><b>Diagnostic</b> : cliquez sur une alerte pour voir l'élément concerné clignoter sur le schéma, puis corrigez-la en un clic.</p>
      <p><b>Fiches</b> : cliquez sur n'importe quel élément du schéma (pompe, conduite, vanne, clapet, coffret…) pour voir ses caractéristiques, ses alertes et des photos réelles.</p>
      <p><b>Mise en service</b> : saisissez les pressions, le débit, les courants et la tension relevés sur place ; l'application les compare au calcul et indique les causes probables d'écart (sens de rotation, vanne, colmatage, entrée d'air, usure, déséquilibre électrique).</p>
      <p><b>Matériel & rapport</b> : nomenclature complète, électricité, solaire, pertes de charge, courbes, et impression du rapport.</p>
      <p className="muted small">Version du {appVersion()}. Si un bandeau « Nouvelle version disponible » apparaît, touchez « Mettre à jour ».</p>
      <p><b>Sans internet</b> : bouton « Installer » pour ajouter l'application à l'écran d'accueil du téléphone ; elle fonctionne ensuite hors ligne.</p>
    </div>
  );
}

export default function App() {
  const [inst, setInst] = useState<Installation>(load);
  const [page, setPage] = useState<Page>(() => (PAGES.find((p) => `#${p.id}` === window.location.hash)?.id ?? 'design'));
  const [selected, setSelected] = useState<string | null>(null);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [guide, setGuide] = useState(false);
  const [reset, setReset] = useState(false);
  const [resetApp, setResetApp] = useState<AppId>('transfert');
  const [resetEquip, setResetEquip] = useState(false);
  const [resetName, setResetName] = useState('');
  const ev = useMemo(() => evaluate(inst), [inst]);

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(inst)); } catch { /* ignore */ } }, [inst]);
  useEffect(() => { window.history.replaceState(null, '', `#${page}`); window.scrollTo({ top: 0 }); }, [page]);
  // L'alerte sélectionnée disparaît si elle est corrigée
  useEffect(() => { if (activeIssue && !ev.issues.some((x) => x.id === activeIssue.id)) setActiveIssue(null); }, [ev, activeIssue]);

  useEffect(() => { setSelected(null); setActiveIssue(null); }, [inst.name, inst.app, inst.pumpType, inst.mode]);

  const highlight = activeIssue ? targetsOf(activeIssue.id) : selected ? [selected] : [];
  const showDiagram = () => window.setTimeout(() => {
    const el = document.getElementById('diagram');
    if (el && el.getBoundingClientRect().top < 60 || (el && el.getBoundingClientRect().bottom > window.innerHeight)) el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 30);
  const s: Shared = {
    inst, ev, highlight, selected, activeIssue,
    set: (fn) => setInst((i) => ensureElec(fn(i))),
    pick: (t) => { setSelected(t); setActiveIssue(null); },
    selectIssue: (x) => { setActiveIssue(x); setSelected(targetsOf(x.id)[0] ?? null); showDiagram(); },
    fix: (x) => { if (x.fix) setInst((i) => ensureElec(x.fix!.apply(i))); },
    clearIssue: () => setActiveIssue(null),
  };
  const lvl = ev.verdict.level === 'excellent' || ev.verdict.level === 'good' ? 'ok' : ev.verdict.level === 'fair' ? 'warning' : 'critical';
  const nC = ev.issues.filter((x) => x.sev === 'critical').length;

  return (
    <div className="app">
      <header className="appbar">
        <span className="brand"><img src="/logo.png" alt="ECO PUMP AFRIK" /><span>Configurateur d'installation</span></span>
        <nav className="pagenav" aria-label="Pages">
          {PAGES.map((p) => (
            <button key={p.id} aria-current={page === p.id ? 'page' : undefined} onClick={() => setPage(p.id)}>
              <p.icon size={17} aria-hidden /><span>{p.label}</span>
              {p.id === 'diag' && nC > 0 && <i className="navbadge">{nC}</i>}
            </button>
          ))}
        </nav>
        <div className="sp" />
        <OfflineAndInstall />
        <button className={`scorechip lv-${lvl}`} onClick={() => setPage('diag')} title={ev.verdict.label}>{ev.score}<small>/100</small></button>
        <button className="btn newbtn" onClick={() => { setResetName(''); setReset(true); }} title="Repartir de zéro"><FilePlus2 size={17} aria-hidden /><span>Nouvelle</span></button>
        <button className="icon-btn" onClick={() => window.print()} aria-label="Imprimer le rapport"><Printer size={18} /></button>
        <button className="icon-btn" onClick={() => setGuide(true)} aria-label="Guide"><BookOpen size={18} /></button>
      </header>

      <UpdateBanner />
      <main className="screen">
        <div className="page-title">
          <h1>{PAGES.find((p) => p.id === page)?.label}</h1>
          <p className="muted">{inst.name}</p>
        </div>
        {page === 'design' && <DesignPage s={s} goDiag={() => setPage('diag')} />}
        {page === 'sim' && <SimPage s={s} />}
        {page === 'diag' && <DiagPage s={s} />}
        {page === 'com' && <CommissionPage i={inst} ev={ev} set={s.set} />}
        {page === 'mat' && <MaterialPage s={s} />}
      </main>

      <div className="print-report" aria-hidden>
        <h1>Rapport d'installation — {inst.name}</h1>
        {page === 'com' && <CommissionResults i={inst} ev={ev} />}
        <ScoreCard ev={ev} />
        <KeyFigures i={inst} ev={ev} />
        <section className="card"><PidView i={inst} h={ev.hydro} /></section>
        <Alerts ev={ev} onFix={() => undefined} printAll />
        <Recommendations ev={ev} />
        <PartsAtRisk ev={ev} />
        <Goods ev={ev} />
        <ElecCard i={inst} ev={ev} />
        <LossTable ev={ev} />
        <MountOrder i={inst} ev={ev} onFix={() => undefined} />
        <Bom i={inst} ev={ev} onFix={() => undefined} />
      </div>

      {reset && (
        <div className="backdrop" onClick={() => setReset(false)}>
          <div className="modal wide" role="dialog" aria-modal aria-label="Nouvelle installation" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Nouvelle installation</h2><button className="icon-btn" onClick={() => setReset(false)} aria-label="Fermer"><X size={20} /></button></div>
            <p className="muted">L'installation actuelle (« {inst.name} ») sera remplacée. Choisissez l'application : vous partirez d'une installation vide, sans accessoire, à concevoir étape par étape.</p>
            <label className="ifld"><span>Nom du projet</span><input value={resetName} placeholder="Ex. : Forage de Kibera" onChange={(e) => setResetName(e.target.value)} /></label>
            <div className="appgrid">
              {(Object.keys(APPS) as AppId[]).map((a) => (
                <button key={a} className={resetApp === a ? 'appcard on' : 'appcard'} onClick={() => setResetApp(a)}>
                  <b>{APPS[a].label}</b><small>{APPS[a].desc}</small>
                </button>
              ))}
            </div>
            <label className="itoggle"><input type="checkbox" checked={resetEquip} onChange={(e) => setResetEquip(e.target.checked)} /><span>Ajouter tout de suite les accessoires obligatoires</span></label>
            <div className="row end">
              <button className="btn" onClick={() => setReset(false)}>Annuler</button>
              <button className="btn primary" onClick={() => {
                const n = empty(resetApp, resetEquip);
                setInst({ ...n, name: resetName.trim() || `Nouvelle installation — ${APPS[resetApp].label}` });
                setSelected(null); setActiveIssue(null); setReset(false); setPage('design');
              }}><FilePlus2 size={16} aria-hidden /> Commencer de zéro</button>
            </div>
          </div>
        </div>
      )}
      {guide && (
        <div className="backdrop" onClick={() => setGuide(false)}>
          <div className="modal" role="dialog" aria-modal aria-label="Guide" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Comment ça marche</h2><button className="icon-btn" onClick={() => setGuide(false)} aria-label="Fermer"><X size={20} /></button></div>
            <Guide />
          </div>
        </div>
      )}
    </div>
  );
}
