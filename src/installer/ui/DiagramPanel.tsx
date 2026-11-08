import { useEffect, useState, type ReactNode } from 'react';
import { Activity, Camera, CircuitBoard, ExternalLink, Eye, Network, Plus, Trash2, X, Zap } from 'lucide-react';
import { ACC, APPS, NEED_LABEL, PIPE_MATS, PUMP_MATS, PUMP_TYPES, refLen } from '../catalog';
import type { Evaluation } from '../evaluate';
import { defaultDn } from '../evaluate';
import { photoQuery, targetLabel, targetsOf } from '../targets';
import { posAdvice } from '../positions';
import { termLines, type TermLive } from '../terminal';
import type { Installation, Issue } from '../types';
import { LevelIcon } from '../../ui/Status';
import { fmt } from '../../ui/util';
import { RealView, type Live } from './RealView';
import { PidView } from './PidView';
import { InstCurve } from './Report';
import { CabinetView, WiringView, type ELive } from './Electrical';

type View = 'real' | 'pid' | 'curve' | 'cab' | 'wire';
const LV = { critical: 'critical', warning: 'warning', info: 'info' } as const;

interface Photo { thumb: string; page: string; title: string }
const photoCache = new Map<string, Photo[]>();

/** Photos réelles libres de droits (Wikimedia Commons), chargées à la demande. */
export function Photos({ query, label }: { query: string; label: string }) {
  const [list, setList] = useState<Photo[] | null>(photoCache.get(query) ?? null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (photoCache.has(query)) { setList(photoCache.get(query)!); return; }
    setList(null); setErr(false);
    const ctl = new AbortController();
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(`filetype:bitmap ${query}`)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url&iiurlwidth=360&format=json&origin=*`;
    fetch(url, { signal: ctl.signal })
      .then((r) => r.json())
      .then((j) => {
        const pages = Object.values(j?.query?.pages ?? {}) as { index: number; title: string; imageinfo?: { thumburl?: string; descriptionurl?: string }[] }[];
        const out = pages.sort((a, b) => a.index - b.index)
          .map((p) => ({ thumb: p.imageinfo?.[0]?.thumburl ?? '', page: p.imageinfo?.[0]?.descriptionurl ?? '', title: p.title.replace(/^File:/, '').replace(/\.[a-z]+$/i, '') }))
          .filter((p) => p.thumb).slice(0, 6);
        photoCache.set(query, out); setList(out);
      })
      .catch((e) => { if (e.name !== 'AbortError') setErr(true); });
    return () => ctl.abort();
  }, [query]);
  const google = `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(`${label} pompe`)}`;
  return (
    <div className="photos">
      <h5><Camera size={14} aria-hidden /> Photos réelles</h5>
      {list === null && !err && <div className="ph-grid">{[0, 1, 2].map((k) => <div key={k} className="ph-skel" />)}</div>}
      {list && list.length > 0 && (
        <div className="ph-grid">
          {list.map((p) => (
            <a key={p.thumb} href={p.page} target="_blank" rel="noreferrer" title={p.title}>
              <img src={p.thumb} alt={p.title} loading="lazy" />
            </a>
          ))}
        </div>
      )}
      {(err || (list && list.length === 0)) && <p className="muted small">{!navigator.onLine ? 'Hors ligne : les photos s\'afficheront avec une connexion (celles déjà vues restent disponibles).' : 'Pas de photo libre trouvée pour cet élément.'}</p>}
      <a className="btn sm" href={google} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden /> Plus de photos</a>
      <small className="muted small">Photos Wikimedia Commons (licences libres, cliquer pour l'auteur).</small>
    </div>
  );
}

function Detail({ t, i, ev, onIssue, onSet, onClose }: {
  t: string; i: Installation; ev: Evaluation; onIssue: (x: Issue) => void; onSet: (fn: (x: Installation) => Installation) => void; onClose: () => void;
}) {
  const h = ev.hydro;
  const rows: [string, string][] = [];
  let action: ReactNode = null;
  if (t === 'pump') {
    rows.push(['Type', PUMP_TYPES[i.pumpType].label], ['Nominal', `${fmt(i.pump.qn, 1)} m³/h à ${fmt(i.pump.hn, 1)} m · ${i.pump.nn} tr/min`],
      ['Point de fonctionnement', h.ok ? `${fmt(h.q, 1)} m³/h à ${fmt(h.h, 1)} m (${fmt(h.x * 100, 0)} % du BEP)` : 'aucun débit'],
      ['Rendement / puissance', `${fmt(h.eta * 100, 0)} % · ${fmt(h.pShaft, 2)} kW sur ${fmt(i.pump.motorKw, 1)} kW`],
      ['NPSH', `disponible ${fmt(h.npsha, 1)} m / requis ${fmt(h.npshr, 1)} m`], ['Matériau', PUMP_MATS[i.pump.material]]);
  } else if (t === 'asp' || t === 'ref') {
    const r = t === 'asp' ? i.asp : i.ref;
    rows.push(['Tube', `${PIPE_MATS[r.material].label} DN${r.dn} PN${r.pn}`], ['Longueur', `${fmt(t === 'ref' ? refLen(i) : r.length, 0)} m · ${r.elbows} coude(s)`],
      ['Vitesse', `${fmt(t === 'asp' ? h.vAsp : h.vRef, 2)} m/s`], ['Pertes de charge', `${fmt(t === 'asp' ? h.lossAsp : h.lossRef, 2)} m`]);
    if (t === 'ref') rows.push(['Coup de bélier', `${fmt(h.surge, 0)} m de surpression à l'arrêt brutal`]);
  } else if (t === 'cable') {
    const r = ev.elec;
    rows.push(['Câble', `${r.cores} ${String(i.elec.cableSec).replace('.', ',')} mm² · ${i.elec.cableLen} m`], ['Courant', `${fmt(r.inom, 1)} A nominal · ${fmt(r.istart, 0)} A au démarrage`],
      ['Chute de tension', `${fmt(r.dropRun, 1)} % en marche · ${fmt(r.dropStart, 1)} % au démarrage`], ['Protection', r.breaker], ['Section conseillée', `${r.cores} ${String(r.secRec).replace('.', ',')} mm²`]);
  } else if (t === 'pv' && ev.elec.solar) {
    const s = ev.elec.solar;
    rows.push(['Panneaux', `${s.n} × ${i.elec.solar.panelWc} Wc (${s.ns} série × ${s.np})`], ['Puissance crête', `${fmt(s.wc / 1000, 2)} kWc`], ['Volume / jour', `≈ ${fmt(s.dailyM3, 1)} m³`], ['Surface', `≈ ${fmt(s.area, 0)} m²`]);
  } else if (t === 'source') {
    if (i.pumpType === 'immergee_forage') rows.push(['Niveaux', `statique ${i.geo.staticLevel} m · dynamique ${i.geo.dynamicLevel} m`], ['Forage', `${i.geo.boreDepth} m · Ø ${i.geo.boreDia} mm`], ['Pompe', `à ${i.geo.pumpDepth} m`]);
    else if (i.mode === 'immergee') rows.push(['Volume utile', `${i.geo.tankVolume} L`], ['Eau au-dessus de la pompe', `${i.geo.wetLevel} m`]);
    else rows.push([i.mode === 'aspiration' ? 'Hauteur d\'aspiration' : 'Charge', `${i.mode === 'aspiration' ? i.geo.suctionLift : i.geo.chargeHead} m`], ['Immersion de l\'entrée', `${i.geo.immersion} m (mini ${fmt(h.vortexS, 2)} m)`], ['Distance au fond', `${i.geo.bottom} m`]);
  } else if (t === 'dest') {
    rows.push(['Destination', APPS[i.app].label], ['Hauteur', `${i.geo.hRef} m`], ['Pression demandée', `${i.duty.pRes} bar`]);
  } else if (t.startsWith('acc:')) {
    const id = t.slice(4);
    const a = ACC[id];
    const st = i.acc[id];
    const need = ev.needs[id];
    rows.push(['Rôle', a?.desc ?? ''], ['Où l\'installer', posAdvice(id, i, h)], ['Pour cette installation', NEED_LABEL[need] || 'Non concerné'], ['État', st?.on ? `Installé${a?.inline ? ` · DN${st.dn}` : ''}` : 'Non installé']);
    if (id === 'vessie' && ev.elec.vessel) rows.push(['Réglages', `${ev.elec.vessel.vol} L PN${ev.elec.vessel.pn} · ${fmt(ev.elec.vessel.pOn, 1)}/${fmt(ev.elec.vessel.pOff, 1)} bar`]);
    action = st?.on
      ? <button className="btn sm" onClick={() => onSet((x) => ({ ...x, acc: { ...x.acc, [id]: { ...x.acc[id], on: false } } }))}><Trash2 size={14} aria-hidden /> Retirer</button>
      : <button className="btn primary sm" onClick={() => onSet((x) => ({ ...x, acc: { ...x.acc, [id]: { dn: defaultDn(x, id), qty: 1, ...((x.acc[id] as object | undefined) ?? {}), on: true } } }))}><Plus size={14} aria-hidden /> Ajouter</button>;
  }
  const related = ev.issues.filter((x) => targetsOf(x.id).includes(t));
  return (
    <section className="detail card">
      <div className="detail-head">
        <h3>{targetLabel(t)}</h3>
        <button className="icon-btn sm" onClick={onClose} aria-label="Fermer la fiche"><X size={16} /></button>
      </div>
      <div className="detail-grid">
        <div>
          <table className="tbl kv"><tbody>{rows.map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}</tbody></table>
          {action}
          <h5 className="mt-s">Alertes liées</h5>
          {related.length === 0 ? <p className="muted small">Aucune alerte sur cet élément.</p> : (
            <ul className="rel">
              {related.map((x) => (
                <li key={x.id}><button className={`relbtn lv-${LV[x.sev]}`} onClick={() => onIssue(x)}><LevelIcon level={LV[x.sev]} size={14} /> {x.title}</button></li>
              ))}
            </ul>
          )}
        </div>
        <Photos query={photoQuery(t, i.pumpType)} label={targetLabel(t)} />
      </div>
    </section>
  );
}

export function DiagramPanel({ i, ev, highlight, selected, onPick, onIssue, onSet, live, banner, onCloseBanner }: {
  i: Installation; ev: Evaluation; highlight: string[]; selected: string | null;
  onPick: (t: string | null) => void; onIssue: (x: Issue) => void; onSet: (fn: (x: Installation) => Installation) => void;
  live?: Live & Partial<TermLive>; banner?: Issue | null; onCloseBanner?: () => void;
}) {
  const term = termLines(i, ev, live ? { on: live.on, r: live.r, kind: live.kind, x: live.x, clock: live.clock, events: live.events, starts: live.starts, vol: live.vol, kwh: live.kwh, hz: live.hz } : undefined);
  const [view, setView] = useState<View>('real');
  const elive: ELive | undefined = live ? {
    isolated: !!live.isolated, powered: live.powered ?? true, on: live.on, trip: live.trip ?? null, tripKind: live.tripKind ?? null, hum: !!live.hum, amps: live.r.amps, faults: live.faults ?? [],
    coilOn: live.on && !(live.runaway && (live.faults ?? []).includes('contacteur_colle')),
    running: (() => {
      if (!live.on) return [];
      const cnt = Math.max(1, i.pump.count ?? 1);
      // Pompe 1 isolée : seules les autres peuvent tourner
      const ids = Array.from({ length: cnt }, (_, k) => k + 1).filter((k) => !(live.isolated && k === 1));
      const nRun = Math.max(1, Math.min(ids.length, cnt - Math.max(0, i.pump.standby ?? 0)));
      // Permutation : la pompe de tête change à chaque démarrage
      const first = i.pump.alternate && ids.length > 1 ? (Math.max(0, (live.starts ?? 1) - 1) % ids.length) : 0;
      return Array.from({ length: nRun }, (_, k) => ids[(first + k) % ids.length]);
    })(),
  } : undefined;
  return (
    <div className="diagram" id="diagram">
      <section className="card views">
        <div className="vtabs" role="tablist">
          <button role="tab" aria-selected={view === 'real'} onClick={() => setView('real')}><Eye size={15} aria-hidden /> Vue réelle</button>
          <button role="tab" aria-selected={view === 'pid'} onClick={() => setView('pid')}><Network size={15} aria-hidden /> Schéma P&ID</button>
          <button role="tab" aria-selected={view === 'curve'} onClick={() => setView('curve')}><Activity size={15} aria-hidden /> Courbes</button>
          <button role="tab" aria-selected={view === 'cab'} onClick={() => setView('cab')}><CircuitBoard size={15} aria-hidden /> Coffret</button>
          <button role="tab" aria-selected={view === 'wire'} onClick={() => setView('wire')}><Zap size={15} aria-hidden /> Schéma élec.</button>
          <span className="vhint">Cliquez sur un élément pour sa fiche</span>
        </div>
        {banner && (
          <div className={`banner lv-${LV[banner.sev]}`}>
            <LevelIcon level={LV[banner.sev]} size={16} />
            <span><b>{banner.title}</b> — {banner.detail}</span>
            {onCloseBanner && <button className="icon-btn sm" onClick={onCloseBanner} aria-label="Fermer"><X size={14} /></button>}
          </div>
        )}
        <div className="vbody" onClick={() => onPick(null)}>
          {view === 'real' && <RealView i={i} h={ev.hydro} highlight={highlight} onPick={onPick} live={live} term={term} />}
          {view === 'pid' && <PidView i={i} h={ev.hydro} highlight={highlight} onPick={onPick} />}
          {view === 'curve' && <InstCurve i={i} ev={ev} />}
          {view === 'cab' && <CabinetView i={i} ev={ev} live={elive} />}
          {view === 'wire' && <WiringView i={i} ev={ev} live={elive} />}
        </div>
      </section>
      {selected && <Detail t={selected} i={i} ev={ev} onIssue={onIssue} onSet={onSet} onClose={() => onPick(null)} />}
    </div>
  );
}
