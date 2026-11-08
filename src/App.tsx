import { useEffect, useMemo, useState } from 'react';
import { BookOpen, ClipboardCheck, Wand2, FileDown, FilePlus2, FlaskConical, Package, PencilRuler, Printer, Stethoscope, X } from 'lucide-react';
import { APPS } from './installer/catalog';
import { evaluate } from './installer/evaluate';
import { ensureElec } from './installer/electrical';
import { PRESETS, empty } from './installer/presets';
import { targetsOf } from './installer/targets';
import type { AppId, Installation, Issue } from './installer/types';
import { OfflineAndInstall } from './ui/Offline';
import { UpdateBanner, appVersion } from './ui/Update';
import { ProjectsButton, ProjectsModal } from './ui/Projects';
import { createProject, currentId, fromLink, listProjects, loadProject, saveProject, setCurrent } from './projects';
import { buildReportPdf, shareOrDownload } from './ui/pdf';
import { PrintReport } from './ui/PrintReport';
import { DesignPage, DiagPage, MaterialPage, SimPage, type Shared } from './installer/ui/Pages';
import { CommissionPage } from './installer/ui/CommissionPage';
import { Wizard } from './installer/ui/Wizard';

type Page = 'design' | 'sim' | 'diag' | 'com' | 'mat';
const PAGES: { id: Page; label: string; icon: typeof PencilRuler }[] = [
  { id: 'design', label: 'Conception', icon: PencilRuler },
  { id: 'sim', label: 'Simulation', icon: FlaskConical },
  { id: 'diag', label: 'Diagnostic', icon: Stethoscope },
  { id: 'com', label: 'Mise en service', icon: ClipboardCheck },
  { id: 'mat', label: 'Matériel & rapport', icon: Package },
];
const START_HASH = window.location.hash; // lu avant que la navigation ne le remplace (lien de projet partagé)

function initial(): { id: string; inst: Installation } {
  const cur = currentId();
  const ids = [cur, ...listProjects().map((p) => p.id)].filter(Boolean) as string[];
  for (const id of ids) { const x = loadProject(id); if (x) return { id, inst: x }; }
  const inst = PRESETS[3].build();
  return { id: createProject(inst), inst };
}

function Guide() {
  return (
    <div className="guide">
      <p><b>Conception guidée</b> : bouton « Nouvelle » → « Conception guidée » : l'application vous pose les questions une par une et dimensionne tout.</p>
      <p><b>Conception</b> : décrivez l'installation étape par étape (ou partez d'un exemple). La vue réelle, le schéma P&ID et la note se mettent à jour à chaque saisie.</p>
      <p><b>Simulation</b> : mettez la pompe en marche ou à l'arrêt, faites défiler le temps et jouez sur la vanne, la vitesse, le niveau d'eau, le colmatage ou l'usure. Les instruments, les courbes, les alertes et le journal des événements réagissent en direct.</p>
      <p><b>Pannes</b> (page Simulation) : provoquez une panne (hydraulique, manque d'eau, accessoire, électrique, réseau, pompe/moteur) ou une « panne mystère » : l'application relève les symptômes, classe les causes probables et donne les vérifications et la réparation.</p>
      <p><b>Coffret et schéma électrique</b> : onglets « Coffret » (composants cliquables, réglages, état en direct) et « Schéma élec. » (puissance et commande, conducteurs sous tension en orange).</p>
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
  const [init] = useState(initial);
  const [projId, setProjId] = useState<string>(init.id);
  const [inst, setInst] = useState<Installation>(init.inst);
  const [projOpen, setProjOpen] = useState(false);
  const [page, setPage] = useState<Page>(() => (PAGES.find((p) => `#${p.id}` === window.location.hash)?.id ?? 'design'));
  const [selected, setSelected] = useState<string | null>(null);
  const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
  const [guide, setGuide] = useState(false);
  const [reset, setReset] = useState(false);
  const [rep, setRep] = useState(false);
  const [wiz, setWiz] = useState(false);
  useEffect(() => { const o = () => { setReset(false); setWiz(true); }; window.addEventListener('open-wizard', o); return () => window.removeEventListener('open-wizard', o); }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const say = (m: string) => { setToast(m); window.setTimeout(() => setToast(null), 4500); };
  const standaloneIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) && ((navigator as Navigator & { standalone?: boolean }).standalone === true || window.matchMedia('(display-mode: standalone)').matches);
  const exportPdf = async () => {
    setBusy('Création du PDF…');
    document.body.classList.add('pdf-export');
    setPrinting(true);
    try {
      // Le rapport n'est monté qu'au moment de l'export : on laisse les schémas et graphiques se dessiner
      await new Promise((r) => window.setTimeout(r, 900));
      const el = document.querySelector<HTMLElement>('.print-report.main');
      if (!el) throw new Error('rapport introuvable');
      const blob = await buildReportPdf(el, inst.name);
      const safe = inst.name.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'installation';
      document.body.classList.remove('pdf-export');
      setPrinting(false);
      const r = await shareOrDownload(blob, `Rapport-${safe}.pdf`, `Rapport — ${inst.name}`);
      setBusy(r === 'downloaded' ? 'PDF téléchargé.' : r === 'shared' ? 'PDF partagé.' : null);
      window.setTimeout(() => setBusy(null), 2500);
    } catch (e) {
      document.body.classList.remove('pdf-export');
      setPrinting(false);
      setBusy(`Échec de la création du PDF (${(e as Error).message}).`);
    }
  };
  const [resetApp, setResetApp] = useState<AppId>('transfert');
  const [resetEquip, setResetEquip] = useState(false);
  const [resetName, setResetName] = useState('');
  const ev = useMemo(() => evaluate(inst), [inst]);

  // Enregistrement automatique du projet ouvert
  useEffect(() => { if (projId && !saveProject(projId, inst)) say('Mémoire de l\'appareil pleine : exportez puis supprimez d\'anciens projets.'); }, [inst, projId]);
  const openProject = (id: string) => {
    const x = id ? loadProject(id) : null;
    if (!x) return;
    setProjId(id); setCurrent(id); setInst(x); setSelected(null); setActiveIssue(null); setProjOpen(false);
  };
  const newProject = (x: Installation, msg?: string) => {
    const n = ensureElec(x);
    const id = createProject(n);
    setProjId(id); setInst(n); setSelected(null); setActiveIssue(null); setProjOpen(false); setPage('design');
    if (msg) say(msg);
  };
  // Projet reçu par lien, et nouveaux projets demandés par la page Conception (exemples)
  useEffect(() => {
    if (START_HASH.startsWith('#projet=')) {
      fromLink(START_HASH).then((x) => { if (x) newProject(x, `Projet reçu « ${x.name} » : ajouté à vos projets.`); }).catch(() => say('Lien de projet illisible.'));
    }
    const onNew = (e: Event) => newProject((e as CustomEvent<Installation>).detail);
    window.addEventListener('ecopump-new', onNew);
    return () => window.removeEventListener('ecopump-new', onNew);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
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
        <ProjectsButton onClick={() => setProjOpen(true)} />
        <button className="btn newbtn" onClick={() => { setResetName(''); setReset(true); }} title="Nouveau projet"><FilePlus2 size={17} aria-hidden /><span>Nouvelle</span></button>
        <button className="icon-btn" onClick={() => setRep(true)} aria-label="Rapport PDF / impression"><FileDown size={18} /></button>
        <button className="icon-btn" onClick={() => setGuide(true)} aria-label="Guide"><BookOpen size={18} /></button>
      </header>

      <UpdateBanner />
      {toast && <div className="toast" role="status">{toast}</div>}
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

      {printing && <PrintReport inst={inst} ev={ev} />}

      {rep && (
        <div className="backdrop" onClick={() => !busy?.startsWith('Création') && setRep(false)}>
          <div className="modal" role="dialog" aria-modal aria-label="Rapport" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Rapport de l'installation</h2><button className="icon-btn" onClick={() => setRep(false)} aria-label="Fermer"><X size={20} /></button></div>
            <p className="muted">Le rapport complet : note, chiffres clés, schéma P&ID, alertes, préconisations, pièces exposées, électricité, ordre de montage, nomenclature{inst.commissioning ? ' et procès-verbal de mise en service' : ''}.</p>
            <div className="repbtns">
              <button className="btn primary big" disabled={!!busy?.startsWith('Création')} onClick={exportPdf}><FileDown size={20} aria-hidden /> {busy?.startsWith('Création') ? busy : 'Créer le PDF (partager, enregistrer, imprimer)'}</button>
              {!standaloneIOS && <button className="btn big" onClick={() => { setRep(false); setPrinting(true); window.setTimeout(() => { window.print(); setPrinting(false); }, 900); }}><Printer size={20} aria-hidden /> Imprimer directement</button>}
            </div>
            {busy && !busy.startsWith('Création') && <p className="note ok">{busy}</p>}
            <p className="small muted">Sur iPhone, le PDF s'ouvre dans le menu Partager : choisissez « Imprimer », « Enregistrer dans Fichiers », WhatsApp ou Mail.</p>
          </div>
        </div>
      )}
      {reset && (
        <div className="backdrop" onClick={() => setReset(false)}>
          <div className="modal wide" role="dialog" aria-modal aria-label="Nouvelle installation" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2>Nouvelle installation</h2><button className="icon-btn" onClick={() => setReset(false)} aria-label="Fermer"><X size={20} /></button></div>
            <button className="wz-entry" onClick={() => { setReset(false); setWiz(true); }}>
              <Wand2 size={26} aria-hidden />
              <span><b>Conception guidée (conseillé)</b><small>10 questions simples : l'application calcule les tuyaux, choisit les accessoires, propose la pompe et le câble.</small></span>
            </button>
            <p className="muted small">Ou partez d'une installation vide à remplir vous-même. Le projet actuel (« {inst.name} ») reste enregistré dans « Mes projets ».</p>
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
                newProject({ ...n, name: resetName.trim() || `Nouvelle installation — ${APPS[resetApp].label}` });
                setReset(false);
              }}><FilePlus2 size={16} aria-hidden /> Vide, en mode libre</button>
            </div>
          </div>
        </div>
      )}
      {projOpen && <ProjectsModal currentId={projId} inst={inst} onOpen={openProject} onClose={() => setProjOpen(false)}
        onNew={() => { setProjOpen(false); setResetName(''); setReset(true); }}
        onImport={(x) => newProject(x, `Projet « ${x.name} » importé.`)} />}
      {wiz && <Wizard onClose={() => setWiz(false)} onDone={(n) => { newProject(n); setWiz(false); }} />}
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
