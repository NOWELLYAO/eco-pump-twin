import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Play, Plus, RotateCcw, Sparkles, Trash2, Upload, Wrench, X } from 'lucide-react';
import { ACC, ACCESSORIES, APPS, DN_LIST, FLUIDS, PIPE_MATS, PUMP_TYPES } from '../catalog';
import { evaluate } from '../evaluate';
import { vel } from '../hydraulics';
import {
  DESTS, EMPTY_BUILD, ENERGIES, NEED_LABEL, SOURCES, autoPlace, derive, fromInstallation, inferApp, missing, needOf,
  pumpFitsSource, whyNot, zoneOf, type Build, type BuildParams, type DestId, type SrcId, type Zone,
} from '../build';
import type { AccState, FluidId, Installation, Need, PipeMatId, PumpTypeId, StartId, SupplyId } from '../types';
import { NumField, SelField, Toggle } from './Fields';
import { RealView } from './RealView';
import { RealDefs } from './RealDefs';
import { AccArt, DestArt, EnergyArt, PumpArt, SrcArt, pumpShort } from './BuildArt';
import { fmt } from '../../ui/util';

type Item = { kind: 'src'; id: SrcId } | { kind: 'pump'; id: PumpTypeId } | { kind: 'dest'; id: DestId } | { kind: 'energy'; id: SupplyId } | { kind: 'acc'; id: string; from?: 'asp' | 'ref' | 'ctrl' };
type Sel = 'src' | 'pump' | 'dest' | 'energy' | 'pipe:asp' | 'pipe:ref' | `acc:${string}`;
type Msg = { text: string; lvl: 'ok' | 'warn' | 'bad' | 'info' } | null;
const KEY = 'ecopump-chantier-v1';
const load = (): Build => { try { const x = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return x && Array.isArray(x.asp) ? { ...EMPTY_BUILD, ...x } : EMPTY_BUILD; } catch { return EMPTY_BUILD; } };

const short = (id: string) => ({
  clapet_pied: 'Clapet de pied', crepine: 'Crépine', vanne_asp: 'Vanne asp.', filtre_asp: 'Filtre en Y', prefiltre: 'Préfiltre', manchon_asp: 'Manchon', vacuometre: 'Vacuomètre', cone_exc: 'Cône exc.',
  cone_ref: 'Cône', manometre: 'Manomètre', manchon_ref: 'Manchon', clapet_ar: 'Clapet AR', clapet_boule: 'Clapet boule', vanne_ref: 'Vanne', debitmetre: 'Débitmètre', capteur_p: 'Capteur P',
  pressostat: 'Pressostat', vessie: 'Réservoir à vessie', anti_belier: 'Anti-bélier', ventouse: 'Ventouse', soupape: 'Soupape', vidange: 'Vidange', coffret: 'Coffret', variateur: 'Variateur',
  marche_sec: 'Manque d\'eau', flotteur_arret: 'Flotteur arrêt', flotteur_marche: 'Flotteur marche', flotteur_alarme: 'Flotteur alarme', flotteur_res: 'Flotteur réservoir', sonde_niveau: 'Sonde niveau',
  chemise: 'Chemise', barres: 'Barres de guidage', coffret_inc: 'Coffret incendie', alim_inc: 'Alim. prioritaire', alarme_inc: 'Report alarmes', jockey: 'Pompe jockey', amorcage: 'Rés. amorçage',
  anti_vortex: 'Anti-vortex', essai: 'Circuit d\'essai', soupape_circ: 'Soupape circ.', diesel: 'Motopompe diesel', atex: 'ATEX',
} as Record<string, string>)[id] ?? ACC[id]?.label ?? id;

const NeedTag = ({ n }: { n: Need }) => <span className={`bd-need n-${n}`}>{NEED_LABEL[n]}</span>;

export function BuildPage({ current, onCreate }: { current: Installation; onCreate: (i: Installation) => void }) {
  const [b, setB] = useState<Build>(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* mémoire pleine */ } }, [b]);
  const i = useMemo(() => derive(b), [b]);
  const ev = useMemo(() => evaluate(i), [i]);
  const app = inferApp(b);
  const imm = i.mode === 'immergee';
  const [sel, setSel] = useState<Sel | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const say = (text: string, lvl: NonNullable<Msg>['lvl'] = 'info') => { setMsg({ text, lvl }); };
  const placed = new Set([...b.asp, ...b.ref, ...b.ctrl]);
  const setP = (p: Partial<BuildParams>) => setB((x) => ({ ...x, p: { ...x.p, ...p } }));
  const setAcc = (id: string, s: Partial<AccState>) => setB((x) => ({ ...x, p: { ...x.p, acc: { ...(x.p.acc ?? {}), [id]: { ...(x.p.acc?.[id] ?? {}), ...s } } } }));

  // ---------------- Poser un élément (déposé ou touché) ----------------
  const drop = (it: Item, zone?: Zone, index?: number) => {
    if (it.kind === 'src') {
      let nb: Build = { ...b, src: it.id };
      let note = `Source : ${SOURCES[it.id].label}.`;
      if (b.pump && !pumpFitsSource(b.pump, it.id)) {
        const a = inferApp(nb), alt = APPS[a].pumps.find((p) => pumpFitsSource(p, it.id));
        nb = { ...nb, pump: alt };
        note = `${SOURCES[it.id].label} : la pompe « ${PUMP_TYPES[b.pump].label} » ne convient pas${alt ? `, je l'ai remplacée par « ${PUMP_TYPES[alt].label} »` : ''}.`;
      }
      setB(nb); setSel('src'); say(note, note.includes('remplacée') ? 'warn' : 'ok'); return;
    }
    if (it.kind === 'pump') {
      if (b.src && !pumpFitsSource(it.id, b.src)) { say(`« ${PUMP_TYPES[it.id].label} » ne peut pas puiser dans : ${SOURCES[b.src].label.toLowerCase()}. ${b.src === 'forage' ? 'Dans un forage, il faut une pompe immergée de forage.' : b.src === 'fosse' ? 'Dans une fosse, il faut une pompe submersible (relevage ou drainage).' : 'Une pompe immergée se pose dans un forage ou une fosse.'}`, 'bad'); return; }
      const nb: Build = { ...b, pump: it.id };
      const a = inferApp(nb);
      if (b.src && b.dest && !APPS[a].pumps.includes(it.id)) { say(`Pour ${APPS[a].label.toLowerCase()}, choisissez plutôt : ${APPS[a].pumps.map((p) => PUMP_TYPES[p].label).join(', ')}.`, 'bad'); return; }
      setB(nb); setSel('pump'); say(`Pompe posée : ${PUMP_TYPES[it.id].label}. ${b.autoPump ? 'Je la dimensionne d\'après votre besoin.' : ''}`, 'ok'); return;
    }
    if (it.kind === 'dest') {
      let nb: Build = { ...b, dest: it.id };
      const a = inferApp(nb);
      let note = `Destination : ${DESTS[it.id].label}. Application reconnue : « ${APPS[a].label} ».`;
      if (b.pump && !APPS[a].pumps.includes(b.pump)) {
        const alt = APPS[a].pumps.find((p) => !b.src || pumpFitsSource(p, b.src));
        nb = { ...nb, pump: alt }; note += ` La pompe ne convenait pas : remplacée par « ${alt ? PUMP_TYPES[alt].label : '—'} ».`;
      }
      setB(nb); setSel('dest'); say(note, note.includes('remplacée') ? 'warn' : 'ok'); return;
    }
    if (it.kind === 'energy') {
      setB({ ...b, energy: it.id }); setSel('energy');
      say(it.id === 'solaire' && (app === 'relevage') ? 'Attention : un relevage d\'eaux usées doit tourner la nuit aussi. Sans batteries, le solaire ne convient pas.' : `${ENERGIES[it.id].label} : branché.`, it.id === 'solaire' && app === 'relevage' ? 'warn' : 'ok');
      return;
    }
    // Accessoire
    const id = it.id, z = zoneOf(id), lab = ACC[id]?.label ?? id;
    const moved = it.from === z;
    if (!moved) {
      const n = needOf(i, id, b);
      if (n === 'na') { say(`${lab} : ${whyNot(i, id, b)}`, 'bad'); return; }
      if (z === 'asp' && imm) { say(`${lab} : ${whyNot(i, id, b)}`, 'bad'); return; }
    }
    let nb: Build = { ...b, asp: b.asp.filter((x) => x !== id), ref: b.ref.filter((x) => x !== id), ctrl: b.ctrl.filter((x) => x !== id) };
    let note = '';
    if (zone === z && index != null) {
      const list = [...nb[z]]; const from = b[z].indexOf(id); const at = from >= 0 && from < index ? index - 1 : index;
      list.splice(Math.max(0, Math.min(list.length, at)), 0, id); nb = { ...nb, [z]: list };
    } else {
      nb = autoPlace(nb, id);
      if (zone && zone !== z && ['asp', 'ref', 'ctrl', 'src', 'dest', 'pump'].includes(zone)) note = ` Il se monte ${z === 'asp' ? 'à l\'aspiration' : z === 'ref' ? 'au refoulement' : 'dans la commande'} : je l'ai posé à sa place.`;
    }
    setB(nb); setSel(`acc:${id}`);
    if (!moved) {
      const n = needOf(i, id, b);
      say(n === 'avoid' ? `${lab} : posé, mais déconseillé. ${whyNot(i, id, b)}` : `${lab} : posé.${note}`, n === 'avoid' ? 'warn' : note ? 'info' : 'ok');
    } else say(`${lab} : déplacé.`, 'ok');
  };
  const remove = (id: string) => { setB((x) => ({ ...x, asp: x.asp.filter((y) => y !== id), ref: x.ref.filter((y) => y !== id), ctrl: x.ctrl.filter((y) => y !== id) })); if (sel === `acc:${id}`) setSel(null); say(`${ACC[id]?.label ?? id} : retiré.`, 'info'); };
  const fill = () => {
    let nb = b;
    for (let k = 0; k < 2; k++) { const ii = derive(nb); for (const a of ACCESSORIES) { const n = needOf(ii, a.id, nb); if ((n === 'required' || n === 'recommended') && !(a.id === 'variateur' && ii.elec.supply === 'solaire') && !(a.side === 'asp' && ii.mode === 'immergee')) nb = autoPlace(nb, a.id); } }
    setB(nb); say('Chantier complété : tous les accessoires obligatoires et conseillés sont posés, dans l\'ordre de montage.', 'ok');
  };

  // ---------------- Glisser-déposer (souris et doigt) ----------------
  const [drag, setDrag] = useState<{ it: Item; x: number; y: number; over: { zone: Zone; index?: number } | null; label: string } | null>(null);
  // Souris : le glisser commence après 8 px. Doigt : appui long (0,3 s) puis glisser — un balayage rapide fait défiler la page.
  const start = useRef<{ it: Item; x: number; y: number; label: string; id: number; touch: boolean; armed: boolean; timer?: number } | null>(null);
  const dragged = useRef(false);
  const zoneAt = (x: number, y: number): { zone: Zone; index?: number } | null => {
    const el = document.elementFromPoint(x, y)?.closest('[data-zone]') as HTMLElement | null;
    if (!el) return null;
    const zone = el.dataset.zone as Zone;
    if (zone !== 'asp' && zone !== 'ref' && zone !== 'ctrl') return { zone };
    const chips = [...el.querySelectorAll<HTMLElement>('[data-chip]')];
    let index = chips.length;
    for (let k = 0; k < chips.length; k++) { const r = chips[k].getBoundingClientRect(); if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) { index = k; break; } }
    return { zone, index };
  };
  const onDown = (e: RPointerEvent, it: Item, label: string) => {
    if (e.button !== 0) return;
    const touch = e.pointerType !== 'mouse';
    const s = { it, x: e.clientX, y: e.clientY, label, id: e.pointerId, touch, armed: !touch } as NonNullable<typeof start.current>;
    if (touch) s.timer = window.setTimeout(() => { if (start.current === s) { s.armed = true; try { navigator.vibrate?.(15); } catch { /* */ } setDrag({ it, x: s.x, y: s.y, label, over: zoneAt(s.x, s.y) }); } }, 300);
    start.current = s;
  };
  useEffect(() => {
    const mv = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      const far = Math.hypot(e.clientX - s.x, e.clientY - s.y) >= 8;
      if (!s.armed) { if (s.touch && far) { window.clearTimeout(s.timer); start.current = null; } else if (!s.touch && far) s.armed = true; else return; }
      if (!s.armed) return;
      e.preventDefault();
      setDrag({ it: s.it, x: e.clientX, y: e.clientY, label: s.label, over: zoneAt(e.clientX, e.clientY) });
    };
    const up = (e: PointerEvent) => {
      const s = start.current;
      if (!s || e.pointerId !== s.id) return;
      window.clearTimeout(s.timer); start.current = null;
      if (drag && s.armed) {
        dragged.current = true; window.setTimeout(() => { dragged.current = false; }, 400);
        const o = e.type === 'pointercancel' ? null : zoneAt(e.clientX, e.clientY); setDrag(null);
        if (o) drop(drag.it, o.zone, o.index); else if (e.type !== 'pointercancel' && drag.it.kind === 'acc' && drag.it.from) remove(drag.it.id);
      }
    };
    // Glisser près du haut ou du bas de l'écran : la page défile pour atteindre la zone visée
    const edge = () => {
      const s = start.current;
      if (!s?.armed || !drag) return;
      const y = drag.y, h = window.innerHeight, m = 80;
      const dy = y > h - m ? Math.min(18, (y - (h - m)) / 3) : y < m ? -Math.min(18, (m - y) / 3) : 0;
      if (dy) { window.scrollBy(0, dy); setDrag((d) => (d ? { ...d, over: zoneAt(d.x, d.y) } : d)); }
    };
    const iv = window.setInterval(edge, 30);
    // Doigt : empêche la page de défiler pendant qu'on fait glisser un élément
    const tm = (e: TouchEvent) => { if (start.current?.armed) e.preventDefault(); };
    window.addEventListener('pointermove', mv, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    window.addEventListener('touchmove', tm, { passive: false });
    return () => { window.clearInterval(iv); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); window.removeEventListener('touchmove', tm); };
  });
  // Un appui sans glisser : pose automatique (palette) ou ouverture des réglages (chantier)
  const tap = (it: Item, onChantier: boolean) => { if (drag || dragged.current) return; if (onChantier) { setSel(it.kind === 'acc' ? `acc:${it.id}` : it.kind); return; } drop(it); };
  const dragProps = (it: Item, label: string, onChantier = false) => ({
    onPointerDown: (e: RPointerEvent) => onDown(e, it, label),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    onClick: () => tap(it, onChantier),
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(it, onChantier); } },
    role: 'button' as const, tabIndex: 0,
  });

  // ---------------- Palette : le catalogue du matériel ----------------
  const RANK: Record<Need, number> = { required: 0, recommended: 1, optional: 2, avoid: 3, na: 4 };
  const needHere = (id: string, side: string): Need => (side === 'asp' && imm ? 'na' : needOf(i, id, b));
  const pal = (title: string, children: ReactNode, open = false) => <details className="bd-pg" open={open}><summary>{title}</summary><div className="bd-pitems">{children}</div></details>;
  const card = (key: string, it: Item, label: string, art: ReactNode, opts: { on?: boolean; off?: boolean; tag?: ReactNode; title?: string } = {}) => (
    <div key={key} className={`bd-pi${opts.off ? ' off' : ''}${opts.on ? ' on' : ''}`} title={opts.title} {...dragProps(it, label)}>
      <div className="bd-pi-img">{art}</div>
      <div className="bd-pi-t"><b>{label}</b>{opts.tag}</div>
    </div>
  );
  const accItems = (side: 'asp' | 'ref' | 'ctrl') => ACCESSORIES.filter((a) => a.side === side)
    .sort((x, y) => RANK[needHere(x.id, side)] - RANK[needHere(y.id, side)])
    .map((a) => {
      const n = needHere(a.id, side), on = placed.has(a.id), off = n === 'na';
      return card(a.id, { kind: 'acc', id: a.id }, short(a.id), <AccArt id={a.id} />, { on, off, title: off ? whyNot(i, a.id, b) : a.desc, tag: on ? <span className="bd-need n-on">posé</span> : <NeedTag n={n} /> });
    });

  // ---------------- Le chantier : la vraie installation ----------------
  const ready = !!(b.src && b.pump && b.dest);
  const pickT = (t: string) => {
    if (t === 'source') setSel('src'); else if (t === 'pump') setSel('pump'); else if (t === 'dest') setSel('dest');
    else if (t === 'asp') setSel('pipe:asp'); else if (t === 'ref') setSel('pipe:ref');
    else if (t === 'cable' || t === 'grid' || t === 'gen' || t === 'pv') setSel(b.energy ? 'energy' : null);
    else if (t.startsWith('acc:')) setSel(t as Sel);
  };
  const ELEC = ['coffret', 'variateur', 'marche_sec', 'coffret_inc', 'alim_inc', 'alarme_inc', 'atex'];
  const selT = sel === 'src' ? 'source' : sel === 'pipe:asp' ? 'asp' : sel === 'pipe:ref' ? 'ref' : sel === 'energy' ? 'cable' : sel?.startsWith('acc:') && ELEC.includes(sel.slice(4)) ? 'cable' : sel;
  const over = drag?.over?.zone;
  // Avant que la source, la pompe et la destination soient posées : le terrain, avec leurs emplacements
  const spot = (zone: 'src' | 'pump' | 'dest' | 'energy', x: number, y: number, w: number, h: number, art: ReactNode | null, hint: string) => (
    <g data-zone={zone} className={`bd-spot${art ? ' full' : ''}${over === zone ? ' over' : ''}`} onClick={() => art && setSel(zone)}>
      <rect x={x} y={y} width={w} height={h} rx="14" className="bd-spot-bg" />
      {art ? <svg x={x + 6} y={y + 6} width={w - 12} height={h - 30} viewBox="0 0 120 80" preserveAspectRatio="xMidYMid meet">{art}</svg>
        : <text x={x + w / 2} y={y + h / 2} textAnchor="middle" className="bd-spot-t">{hint}</text>}
      {art && <text x={x + w / 2} y={y + h - 10} textAnchor="middle" className="bd-spot-l">{zone === 'src' ? SOURCES[b.src!].label : zone === 'pump' ? pumpShort(b.pump!) : zone === 'dest' ? DESTS[b.dest!].label : ENERGIES[b.energy!].label}</text>}
    </g>
  );
  const unwrap = (n: ReactNode) => n; // les illustrations sont déjà des <svg>
  const terrain = (
    <svg viewBox="0 0 900 340" className="bd-terrain" role="img" aria-label="Terrain du chantier"><RealDefs />
      <rect x="0" y="0" width="900" height="210" className="r-sky" /><rect x="0" y="210" width="900" height="130" className="r-soil" />
      <path d="M270 250 H360 M540 250 H620" className={`bd-tube${b.src && b.pump ? ' on' : ''}`} />
      {spot('src', 30, 120, 240, 200, b.src ? unwrap(<SrcArt id={b.src} />) : null, 'Déposez la source d\'eau')}
      {spot('pump', 360, 150, 180, 170, b.pump ? unwrap(<PumpArt pt={b.pump} />) : null, 'Déposez la pompe')}
      {spot('dest', 620, 80, 250, 240, b.dest ? unwrap(<DestArt id={b.dest} />) : null, 'Déposez la destination')}
      {spot('energy', 360, 14, 180, 120, b.energy ? unwrap(<EnergyArt id={b.energy} />) : null, 'Énergie')}
    </svg>
  );
  const miss = ready ? missing(i, b) : [];
  const issues = ev.issues.filter((x) => x.sev !== 'info').slice(0, 4);
  const posed = (zone: 'asp' | 'ref' | 'ctrl', title: string) => b[zone].length > 0 && (
    <div className="bd-posed"><small>{title}</small><div>{b[zone].map((id) => {
      const n = needOf(i, id, b), bad = n === 'na' || (zone === 'asp' && imm);
      return (
        <button key={id} type="button" className={`bd-tag${sel === `acc:${id}` ? ' sel' : ''}${bad ? ' bad' : n === 'avoid' ? ' warn' : ''}`} onClick={() => setSel(`acc:${id}`)} title={bad ? whyNot(i, id, b) : ACC[id]?.label}>
          {short(id)}<span className="bd-x" role="button" aria-label={`Retirer ${ACC[id]?.label}`} onClick={(e) => { e.stopPropagation(); remove(id); }}><X size={11} /></span>
        </button>
      );
    })}</div></div>
  );

  return (
    <div className={`page-build${drag ? ' dragging' : ''}`}>
      <p className="bd-intro">Prenez le matériel dans le catalogue et faites-le glisser sur le chantier (ou touchez-le : il se monte tout seul à sa place). Touchez un équipement sur le dessin pour le régler.</p>
      <div className="bd-grid">
        <aside className="card bd-pal" aria-label="Catalogue du matériel">
          <h3><Wrench size={16} aria-hidden /> Catalogue du matériel</h3>
          {pal('Source d\'eau', (Object.keys(SOURCES) as SrcId[]).map((id) => card(id, { kind: 'src', id }, SOURCES[id].label, <SrcArt id={id} />, { on: b.src === id, title: SOURCES[id].desc })), !b.src)}
          {pal('Pompes', (Object.keys(PUMP_TYPES) as PumpTypeId[]).map((id) => { const ok = !b.src || pumpFitsSource(id, b.src); return card(id, { kind: 'pump', id }, pumpShort(id), <PumpArt pt={id} />, { on: b.pump === id, off: !ok, title: ok ? PUMP_TYPES[id].desc : `Ne convient pas pour : ${SOURCES[b.src!].label.toLowerCase()}` }); }), !!b.src && !b.pump)}
          {pal('Destination', (Object.keys(DESTS) as DestId[]).map((id) => card(id, { kind: 'dest', id }, DESTS[id].label, <DestArt id={id} />, { on: b.dest === id, title: DESTS[id].desc })), !!b.pump && !b.dest)}
          {pal('Énergie', (Object.keys(ENERGIES) as SupplyId[]).map((id) => card(id, { kind: 'energy', id }, ENERGIES[id].label, <EnergyArt id={id} />, { on: b.energy === id, title: ENERGIES[id].desc })), ready && !b.energy)}
          {!imm && pal('Aspiration', accItems('asp'))}
          {pal('Refoulement', accItems('ref'), ready && !!b.energy)}
          {pal('Commande et sécurité', accItems('ctrl'))}
        </aside>

        <section className="card bd-site" aria-label="Chantier">
          <div className="bd-site-h">
            <h3>Mon chantier {ready && <small>· {APPS[app].label}</small>}</h3>
            <span className="row">
              <button type="button" className="btn sm" onClick={() => { setB(fromInstallation(current)); setSel(null); say(`Chantier repris du projet « ${current.name} ».`, 'ok'); }}><Upload size={14} aria-hidden /> Partir du projet ouvert</button>
              <button type="button" className="btn sm" onClick={() => { setB(EMPTY_BUILD); setSel(null); setMsg(null); }}><RotateCcw size={14} aria-hidden /> Vider</button>
            </span>
          </div>
          {msg && <div className={`bd-msg ${msg.lvl}`} role="status">{msg.lvl === 'bad' ? <X size={15} aria-hidden /> : msg.lvl === 'warn' ? <AlertTriangle size={15} aria-hidden /> : msg.lvl === 'ok' ? <CheckCircle2 size={15} aria-hidden /> : <Info size={15} aria-hidden />}<span>{msg.text}</span><button type="button" className="bd-x" onClick={() => setMsg(null)} aria-label="Fermer"><X size={12} /></button></div>}
          {ready ? (
            <div className={`bd-scene${over === 'scene' ? ' over' : ''}`} data-zone="scene">
              <RealView i={i} h={ev.hydro} highlight={selT ? [selT] : []} onPick={pickT} missingTags={false} />
              {over === 'scene' && <div className="bd-drophint">Lâchez : l'équipement se monte à sa place</div>}
            </div>
          ) : <div className="bd-scene">{terrain}</div>}
          {ready && (b.asp.length + b.ref.length + b.ctrl.length > 0) && (
            <div className="bd-posedall">{posed('asp', 'Aspiration')}{posed('ref', 'Refoulement')}{posed('ctrl', 'Commande et sécurité')}</div>
          )}
          {drag && ready && <p className="bd-trash"><Info size={14} aria-hidden /> Déposez n'importe où sur le dessin : l'application monte l'équipement au bon endroit.</p>}
        </section>

        <aside className="bd-side">
          {sel && <section className="card bd-cfg"><Config sel={sel} b={b} i={i} ev={ev} setP={setP} setAcc={setAcc} setB={setB} remove={remove} onClose={() => setSel(null)} /></section>}
          <section className="card bd-sum">
            <h3>Bilan du chantier</h3>
            {!ready ? <ul className="bd-todo">{!b.src && <li>Posez une <b>source d'eau</b></li>}{!b.pump && <li>Posez une <b>pompe</b></li>}{!b.dest && <li>Posez une <b>destination</b></li>}</ul> : (
              <>
                <div className={`bd-score lv-${ev.score >= 80 ? 'ok' : ev.score >= 55 ? 'warn' : 'bad'}`}><b>{ev.score}<small>/100</small></b><span>{ev.verdict.label}<small>{ev.hydro.ok ? `Point de fonctionnement : ${fmt(ev.hydro.q, 1)} m³/h à ${fmt(ev.hydro.h, 1)} m` : 'La pompe ne peut pas débiter'}</small></span></div>
                {!b.energy && <p className="bd-warn small">Posez la source d'énergie (réseau, groupe ou solaire).</p>}
                {miss.length > 0 && <div className="bd-block"><h5>Il manque</h5><div className="bd-adds">{miss.map((id) => <button key={id} type="button" className="btn sm" onClick={() => drop({ kind: 'acc', id })}><Plus size={13} aria-hidden /> {short(id)}</button>)}</div></div>}
                {issues.length > 0 && <div className="bd-block"><h5>À revoir</h5><ul className="bd-iss">{issues.map((x) => <li key={x.id} className={x.sev}>{x.title}</li>)}</ul></div>}
                <div className="bd-acts">
                  <button type="button" className="btn" onClick={fill}><Sparkles size={15} aria-hidden /> Compléter automatiquement</button>
                  <button type="button" className="btn primary" onClick={() => onCreate(i)}><Play size={15} aria-hidden /> Créer le projet et simuler</button>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>
      {drag && <div className="bd-ghost" style={{ left: drag.x, top: drag.y }}>{drag.label}</div>}
    </div>
  );
}

/** Réglages de l'élément touché : seulement ce qui compte pour lui, avec les valeurs conseillées. */
function Config({ sel, b, i, ev, setP, setAcc, setB, remove, onClose }: {
  sel: Sel; b: Build; i: Installation; ev: ReturnType<typeof evaluate>; setP: (p: Partial<BuildParams>) => void; setAcc: (id: string, s: Partial<AccState>) => void;
  setB: (f: (b: Build) => Build) => void; remove: (id: string) => void; onClose: () => void;
}) {
  const head = (t: string, sub?: string, extra?: ReactNode) => (
    <div className="bd-cfg-h"><div><b>{t}</b>{sub && <small>{sub}</small>}</div>{extra}<button type="button" className="fold" onClick={onClose} aria-label="Fermer les réglages"><X size={14} /></button></div>
  );
  const fluids = (Object.keys(FLUIDS) as FluidId[]).map((f) => ({ v: f, l: FLUIDS[f].label }));
  if (sel === 'src' && b.src) {
    const s = b.src;
    return (
      <>{head(SOURCES[s].label, SOURCES[s].desc)}
        <div className="bd-f">
          <SelField label="Liquide" value={i.fluid.type} options={fluids} onChange={(v) => setP({ fluid: v })} />
          <NumField label="Température" value={i.fluid.temp} unit="°C" onChange={(v) => setP({ temp: v })} />
          {s === 'forage' && <>
            <NumField label="Niveau statique (au repos)" value={i.geo.staticLevel} unit="m" onChange={(v) => setP({ staticLevel: v })} />
            <NumField label="Niveau dynamique (en pompage)" value={i.geo.dynamicLevel} unit="m" onChange={(v) => setP({ dynamicLevel: v })} hint="Mesuré lors de l'essai de pompage" />
            <NumField label="Profondeur de la pompe" value={i.geo.pumpDepth} unit="m" onChange={(v) => setP({ pumpDepth: v })} hint={`Conseil : au moins ${fmt(i.geo.dynamicLevel + 5, 0)} m (5 m sous le niveau dynamique)`} />
            <NumField label="Profondeur du forage" value={i.geo.boreDepth} unit="m" onChange={(v) => setP({ boreDepth: v })} />
          </>}
          {(s === 'bache_asp' || s === 'riviere' || (s === 'cuve_carb' && i.mode === 'aspiration')) && <NumField label="Hauteur d'aspiration (eau la plus basse sous la pompe)" value={i.geo.suctionLift} unit="m" onChange={(v) => setP({ lift: v })} hint={`Marge NPSH : ${fmt(ev.hydro.margin, 1)} m${ev.hydro.margin < 1 ? ' — trop juste, rapprochez la pompe de l\'eau' : ''}`} wide />}
          {(s === 'bache_charge' || s === 'bassin') && <NumField label="Eau au-dessus de la pompe (niveau mini)" value={i.geo.chargeHead} unit="m" onChange={(v) => setP({ charge: v })} />}
          {s === 'fosse' && <NumField label="Volume utile entre flotteurs" value={i.geo.tankVolume} unit="L" onChange={(v) => setP({ tankVolume: v })} hint="Plus il est grand, moins la pompe démarre souvent" />}
        </div>
      </>
    );
  }
  if (sel === 'pump' && b.pump) {
    const pt = b.pump, forage = pt === 'immergee_forage';
    const arr = [{ v: '1', l: '1 pompe' }, { v: '1+1', l: '1 en service + 1 de secours' }, { v: '2', l: '2 en parallèle' }, { v: '2+1', l: '2 en service + 1 de secours' }];
    const cur = `${(i.pump.count ?? 1) - (i.pump.standby ?? 0)}${(i.pump.standby ?? 0) ? '+1' : ''}`;
    return (
      <>{head(PUMP_TYPES[pt].label, PUMP_TYPES[pt].desc)}
        <Toggle label="Choisir la pompe automatiquement d'après le besoin" checked={b.autoPump} onChange={(v) => setB((x) => ({ ...x, autoPump: v, p: { ...x.p, qn: i.pump.qn, hn: i.pump.hn, kw: i.pump.motorKw } }))} />
        <div className="bd-f">
          {b.autoPump ? (
            <p className="bd-auto"><b>Pompe proposée :</b> {fmt(i.pump.qn, 1)} m³/h à {fmt(i.pump.hn, 1)} m, moteur {fmt(i.pump.motorKw, i.pump.motorKw < 10 ? 2 : 1)} kW{i.pump.model ? ` (${i.pump.model})` : ''}. Elle se recalcule à chaque changement du chantier.</p>
          ) : <>
            <NumField label="Débit nominal" value={i.pump.qn} unit="m³/h" onChange={(v) => setP({ qn: v })} />
            <NumField label="Hauteur nominale" value={i.pump.hn} unit="m" onChange={(v) => setP({ hn: v })} />
            <NumField label="Puissance moteur" value={i.pump.motorKw} unit="kW" onChange={(v) => setP({ kw: v })} />
          </>}
          {!forage && <SelField label="Nombre de pompes" value={arr.some((a) => a.v === cur) ? cur : '1'} options={arr} onChange={(v) => { const [n, s] = v.split('+'); setP({ count: Number(n) + (s ? 1 : 0), standby: s ? 1 : 0 }); }} hint={app2hint(i)} wide />}
          {forage && <p className="small muted">Une seule pompe dans un forage.</p>}
        </div>
      </>
    );
  }
  if (sel === 'dest' && b.dest) {
    const d = b.dest, press = d !== 'chateau' && d !== 'egout' && d !== 'cuve';
    return (
      <>{head(DESTS[d].label, `Application : ${APPS[i.app].label}`)}
        <div className="bd-f">
          <NumField label="Débit voulu" value={i.duty.qReq} unit="m³/h" onChange={(v) => setP({ q: v })} />
          <NumField label="Heures de marche par jour" value={i.duty.hoursPerDay} unit="h" onChange={(v) => setP({ hours: v })} />
          <NumField label={d === 'chateau' ? 'Hauteur de l\'arrivée dans le réservoir' : d === 'batiment' ? 'Hauteur du dernier étage' : 'Hauteur à monter (point le plus haut)'} value={i.geo.hRef} unit="m" onChange={(v) => setP({ hRef: v })} hint={i.pumpType === 'immergee_forage' ? 'Au-dessus du sol (la profondeur de l\'eau s\'ajoute)' : 'Au-dessus de la pompe'} wide />
          {press && <NumField label={d === 'irrigation' ? 'Pression aux asperseurs / goutteurs' : 'Pression au point d\'utilisation'} value={i.duty.pRes} unit="bar" onChange={(v) => setP({ pRes: v })} hint={d === 'batiment' ? '1,5 à 3 bar au robinet le plus haut' : d === 'irrigation' ? 'Goutte-à-goutte ≈ 1 bar, asperseurs 2,5 à 3,5 bar' : undefined} />}
          {d === 'incendie' && <SelField label="Type de réseau" value={i.fire?.kind ?? 'ria'} options={[{ v: 'ria', l: 'Robinets d\'incendie armés (RIA)' }, { v: 'sprinkler', l: 'Sprinkleurs' }]} onChange={(v) => setP({ fireKind: v })} wide />}
        </div>
      </>
    );
  }
  if ((sel === 'pipe:asp' || sel === 'pipe:ref') ) {
    const side = sel === 'pipe:asp' ? 'asp' : 'ref', r = i[side], vmax = side === 'asp' ? 1.2 : i.pumpType === 'immergee_forage' ? 2 : 1.5;
    const rec = DN_LIST.find((dn) => dn >= 25 && vel(i.duty.qReq, dn) <= vmax) ?? r.dn;
    const L = ev.hydro.ok ? ev.hydro : null;
    return (
      <>{head(side === 'asp' ? 'Conduite d\'aspiration' : 'Conduite de refoulement', `Vitesse ${fmt(vel(i.duty.qReq, r.dn), 2)} m/s (conseillé ≤ ${fmt(vmax, 1)} m/s)`)}
        <div className="bd-f">
          <SelField label="Diamètre" value={r.dn} options={DN_LIST.filter((dn) => dn >= 20 && dn <= 300).map((dn) => ({ v: dn, l: `DN${dn} · ${fmt(vel(i.duty.qReq, dn), 2)} m/s${dn === rec ? ' (conseillé)' : ''}` }))} onChange={(v) => setP(side === 'asp' ? { aspDn: v } : { refDn: v })} />
          <SelField label="Matériau" value={r.material} options={(Object.keys(PIPE_MATS) as PipeMatId[]).map((m) => ({ v: m, l: PIPE_MATS[m].label }))} onChange={(v) => setP(side === 'asp' ? { aspMat: v } : { refMat: v })} />
          <NumField label="Longueur" value={r.length} unit="m" onChange={(v) => setP(side === 'asp' ? { aspLen: v } : { refLen: v })} />
          <NumField label="Coudes à 90°" value={r.elbows} onChange={(v) => setP(side === 'asp' ? { aspElbows: Math.round(v) } : { refElbows: Math.round(v) })} />
          {L && <p className="small muted bd-wide">Pertes de charge totales au point de fonctionnement : {fmt(L.hLoss, 1)} m.</p>}
        </div>
      </>
    );
  }
  if (sel === 'energy' && b.energy) {
    const e = b.energy, kw = i.pump.motorKw;
    const starts: { v: StartId; l: string }[] = [{ v: 'direct', l: 'Direct' }, { v: 'progressif', l: 'Démarreur progressif' }, ...(kw >= 5.5 && e !== 'mono' ? [{ v: 'etoile' as StartId, l: 'Étoile-triangle' }] : []), { v: 'variateur', l: 'Variateur' }];
    return (
      <>{head(ENERGIES[e].label, ENERGIES[e].desc)}
        <div className="bd-f">
          <NumField label="Câble coffret → moteur" value={i.elec.cableLen} unit="m" onChange={(v) => setP({ cableLen: v })} hint={`Section conseillée : ${fmt(ev.elec.secRec, 1)} mm²`} />
          {e !== 'solaire' && <SelField label="Démarrage" value={i.elec.start} options={starts} onChange={(v) => setP({ start: v })} hint={kw > 7.5 ? 'Plus de 7,5 kW : démarreur progressif ou variateur conseillé' : 'Moteur de moins de 7,5 kW : le démarrage direct suffit'} />}
          {e === 'groupe' && <p className="bd-auto bd-wide"><b>Groupe conseillé :</b> {fmt(ev.elec.genKva, 0)} kVA ({ev.elec.gen.why}).</p>}
          {e === 'solaire' && <p className="bd-auto bd-wide"><b>Champ solaire :</b> dimensionné automatiquement pour {fmt(i.elec.solar.dailyM3, 0)} m³ par jour ; contrôleur MPPT inclus.</p>}
          {e === 'mono' && kw > 2.2 && <p className="bd-wide small bd-warn">Moteur de {fmt(kw, 1)} kW : trop puissant pour du monophasé, passez en triphasé.</p>}
        </div>
      </>
    );
  }
  if (sel.startsWith('acc:')) {
    const id = sel.slice(4), a = ACC[id], n = needOf(i, id, b), bad = n === 'na' || (a?.side === 'asp' && i.mode === 'immergee');
    const v = ev.elec.vessel;
    return (
      <>{head(a?.label ?? id, a?.desc, <NeedTag n={bad ? 'na' : n} />)}
        {(bad || n === 'avoid') && <p className="bd-warn small">{whyNot(i, id, b)}</p>}
        <div className="bd-f">
          {(id === 'vessie' || id === 'pressostat') && v && <>
            <NumField label="Pression de démarrage" value={v.pOn} unit="bar" onChange={(x) => setAcc('vessie', { pOn: x })} hint={`Conseillé ${fmt(v.rec.pOn, 1)} bar`} />
            <NumField label="Pression d'arrêt" value={v.pOff} unit="bar" onChange={(x) => setAcc('vessie', { pOff: x })} hint={`Conseillé ${fmt(v.rec.pOff, 1)} bar (la pompe peut monter à ${fmt(v.pMax, 1)} bar)`} />
            {id === 'vessie' && <>
              <NumField label="Volume du réservoir" value={v.vol} unit="L" onChange={(x) => setAcc('vessie', { vol: x })} hint={`Conseillé ${fmt(v.volRec, 0)} L : ${fmt(v.starts, 0)} démarrages/h pour ${i.pump.maxStarts} admis`} />
              <NumField label="Précharge d'air" value={v.pre} unit="bar" onChange={(x) => setAcc('vessie', { pre: x })} hint="Pression de démarrage − 0,2 bar, réservoir vide" />
            </>}
          </>}
          {(id === 'vessie' || id === 'pressostat') && !v && <p className="small muted bd-wide">Les réglages apparaîtront quand la pompe pourra atteindre la pression demandée.</p>}
          {a?.inline && <p className="small muted bd-wide">Diamètre : DN{a.side === 'asp' ? i.asp.dn : i.ref.dn}, celui de la conduite.</p>}
          {id === 'manometre' && <p className="small muted bd-wide">Cadran conseillé : 0 à {fmt(Math.ceil(Math.max(4, (ev.hydro.ok ? ev.hydro.h : i.pump.hn) * 1.4 / 10.2)), 0)} bar (1,5 fois la pression maxi).</p>}
          {id === 'debitmetre' && <p className="small muted bd-wide">Laissez 5 DN droits avant et 3 DN après.</p>}
        </div>
        <div className="row"><button type="button" className="btn sm" onClick={() => remove(id)}><Trash2 size={14} aria-hidden /> Retirer</button></div>
      </>
    );
  }
  return null;
}
const app2hint = (i: Installation) => (i.app === 'relevage' || i.app === 'incendie' || i.app === 'surpression' ? 'Pompe de secours conseillée pour cette application' : undefined);
