import { useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, Eye, HelpCircle, RotateCcw, Shuffle, Stethoscope, Wrench, XCircle, Zap } from 'lucide-react';
import { FAULTS, FAULT_CAT, SYM_LABEL, diagnose, faultById, type FaultCat, type FaultDef, type Sym } from '../faults';
import { PARTS } from '../catalog';
import type { SimKind } from '../sim';
import type { Installation, Issue } from '../types';

export interface Mystery { id: string; answer: string | null; options: string[] }

const SEV_SYM: Partial<Record<Sym, 'crit'>> = {
  decl_thermique: 'crit', decl_diff: 'crit', decl_manque_eau: 'crit', decl_sous_charge: 'crit', decl_variateur: 'crit', marche_a_sec: 'crit', debordement: 'crit',
  ronfle: 'crit', debit_nul: 'crit', ne_s_arrete_pas: 'crit', pas_de_tension: 'crit',
};

function FaultInfo({ f, active, onShow, onRepair }: { f: FaultDef; active: boolean; onShow: (t: string) => void; onRepair?: () => void }) {
  return (
    <div className="fi">
      <p className="fi-what">{f.what}</p>
      <h6>Constats sur le terrain</h6>
      <ul>{f.field.map((x) => <li key={x}>{x}</li>)}</ul>
      <h6>Comment le vérifier</h6>
      <ol>{f.checks.map((x) => <li key={x}>{x}</li>)}</ol>
      <h6>Réparation</h6>
      <ul className="fix">{f.fix.map((x) => <li key={x}><Wrench size={13} aria-hidden /> {x}</li>)}</ul>
      {f.parts.length > 0 && <div className="parts">{f.parts.map((p) => <span key={p} className="part">{PARTS[p] ?? p}</span>)}</div>}
      <div className="row">
        <button type="button" className="btn sm" onClick={() => onShow(f.target)}><Eye size={14} aria-hidden /> Voir sur le schéma</button>
        {active && onRepair && <button type="button" className="btn sm primary" onClick={onRepair}><Wrench size={14} aria-hidden /> Réparer</button>}
      </div>
    </div>
  );
}

export function FaultPanel({ inst, kind, active, obs, design = [], onIssue, onFix, trip, isolated, spare, outageLeft, mystery, onToggle, onMystery, onAnswer, onRepair, onRepairAll, onRearm, onShow }: {
  inst: Installation; kind: SimKind; active: string[]; obs: Sym[];
  design?: Issue[]; onIssue?: (x: Issue) => void; onFix?: (x: Issue) => void; trip: string | null; isolated?: string | null; spare?: boolean; outageLeft: number;
  mystery: Mystery | null;
  onToggle: (id: string) => void; onMystery: () => void; onAnswer: (id: string) => void;
  onRepair: (id: string) => void; onRepairAll: () => void; onRearm: () => void; onShow: (t: string) => void;
}) {
  const cands = useMemo(() => FAULTS.filter((f) => f.applies(inst, kind)), [inst, kind]);
  const [open, setOpen] = useState<string | null>(null);
  const ranked = useMemo(() => diagnose(obs, cands), [obs, cands]);
  const hidden = !!mystery && mystery.answer == null;
  const cats = (Object.keys(FAULT_CAT) as FaultCat[]).filter((c) => cands.some((f) => f.cat === c));
  const shownActive = active.filter((id) => !(hidden && id === mystery?.id));

  return (
    <section className="card faults">
      <h3><Stethoscope size={17} aria-hidden /> Pannes et dépannage</h3>

      {/* État des protections */}
      {isolated && !trip && (
        <div className="fstate out">
          <Zap size={16} aria-hidden />
          <span><b>Pompe 1 isolée : {isolated}</b> — {spare ? 'la pompe de secours a pris le relais.' : 'l\'installation continue avec une pompe de moins (débit réduit).'}</span>
          <button type="button" className="btn sm" onClick={onRearm}><RotateCcw size={14} aria-hidden /> Réarmer</button>
        </div>
      )}
      {(trip || outageLeft > 0) && (
        <div className={`fstate ${trip ? 'trip' : 'out'}`}>
          <Zap size={16} aria-hidden />
          <span>{trip ? <><b>{trip}</b> — pompe bloquée jusqu'au réarmement.</> : <><b>Coupure secteur</b> — retour du courant dans {Math.ceil(outageLeft / 60)} min.</>}</span>
          {trip && <button type="button" className="btn sm" onClick={onRearm}><RotateCcw size={14} aria-hidden /> Réarmer</button>}
        </div>
      )}

      {/* Symptômes */}
      <h4 className="fh">Symptômes observés</h4>
      {obs.length === 0
        ? <p className="muted small ok-line"><CheckCircle2 size={15} aria-hidden /> Aucun symptôme anormal pour l'instant{active.length ? ' (laissez tourner la simulation : certains apparaissent avec le temps)' : ''}.</p>
        : <div className="syms">{obs.map((x) => <span key={x} className={`sym ${SEV_SYM[x] ?? ''}`}>{SYM_LABEL[x]}</span>)}</div>}

      {/* Panne mystère : quiz */}
      {mystery && (
        <div className={`mystery ${mystery.answer == null ? '' : mystery.answer === mystery.id ? 'good' : 'bad'}`}>
          <h4><HelpCircle size={16} aria-hidden /> Panne mystère</h4>
          {mystery.answer == null ? (
            <>
              <p className="small">Une panne s'est produite. Observez les symptômes, le schéma, la console et le journal (accélérez le temps si besoin), puis choisissez la cause :</p>
              <div className="qopts">
                {mystery.options.map((id) => <button key={id} type="button" className="btn qopt" onClick={() => onAnswer(id)}>{faultById(id)?.label}</button>)}
              </div>
            </>
          ) : (
            <>
              <p className="verdict">{mystery.answer === mystery.id ? <><CheckCircle2 size={18} aria-hidden /> Bon diagnostic !</> : <><XCircle size={18} aria-hidden /> Ce n'était pas « {faultById(mystery.answer)?.label} ».</>}</p>
              <p>La panne était : <b>{faultById(mystery.id)?.label}</b></p>
              {faultById(mystery.id) && <FaultInfo f={faultById(mystery.id)!} active={active.includes(mystery.id)} onShow={onShow} onRepair={() => onRepair(mystery.id)} />}
            </>
          )}
        </div>
      )}

      {/* Causes probables */}
      {!hidden && obs.length > 0 && (
        <>
          <h4 className="fh">Causes probables</h4>
          {/* Une installation mal conçue tombe en panne toute seule : ces causes passent en premier */}
          {design.length > 0 && (
            <div className="dcauses">
              <p className="small"><b>{active.length ? 'À vérifier aussi : la conception elle-même' : 'Aucune panne n\'a été provoquée : le problème vient de la conception'}</b>. À corriger dans l'installation :</p>
              <ul>
                {design.slice(0, 4).map((x) => (
                  <li key={x.id}>
                    <XCircle size={16} aria-hidden className="dc-ic" />
                    <span><b>{x.title}</b><small>{x.detail}</small>
                      <span className="row">
                        {x.fix && onFix && <button type="button" className="btn sm primary" onClick={() => onFix(x)}><Wrench size={14} aria-hidden /> {x.fix.label}</button>}
                        {onIssue && <button type="button" className="btn sm" onClick={() => onIssue(x)}><Eye size={14} aria-hidden /> Détails et solutions</button>}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              {ranked.length > 0 && <p className="muted small">{active.length ? 'Pannes du catalogue qui correspondent aux symptômes :' : 'Pannes de matériel qui donneraient les mêmes symptômes (si la conception était correcte) :'}</p>}
            </div>
          )}
          {ranked.length === 0 ? <p className="muted small">Aucune panne du catalogue ne correspond : vérifier le dimensionnement (onglet Diagnostic).</p> : (
            <ul className="causes">
              {ranked.map(({ f, score, match }) => (
                <li key={f.id} className={open === f.id ? 'open' : ''}>
                  <button type="button" className="cause" onClick={() => setOpen(open === f.id ? null : f.id)} aria-expanded={open === f.id}>
                    <span className="cbar"><i style={{ width: `${Math.round(score * 100)}%` }} /></span>
                    <span className="ctxt"><b>{f.label}</b><small>{Math.round(score * 100)} % · {FAULT_CAT[f.cat]} · explique : {match.map((m) => SYM_LABEL[m].toLowerCase()).join(', ')}</small></span>
                    <ChevronDown size={18} aria-hidden className="chev" />
                  </button>
                  {open === f.id && <FaultInfo f={f} active={active.includes(f.id)} onShow={onShow} onRepair={() => onRepair(f.id)} />}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Injection de pannes */}
      <h4 className="fh">Provoquer une panne</h4>
      <button type="button" className="btn primary full" onClick={onMystery}><Shuffle size={16} aria-hidden /> Panne mystère (entraînement au diagnostic)</button>
      {/* Pannes en cours : visibles même listes repliées, un clic pour réparer */}
      {shownActive.length > 0 && (
        <div className="factive">
          <small>En cours :</small>
          {shownActive.map((id) => { const f = cands.find((x) => x.id === id); return f ? <button key={id} type="button" className="chip on" onClick={() => onToggle(id)} title="Réparer cette panne">{f.label} ✕</button> : null; })}
        </div>
      )}
      {/* Types de pannes repliés : on déroule le type, puis on choisit la panne */}
      <div className="fgroups">
        {cats.map((c) => {
          const fs = cands.filter((f) => f.cat === c);
          const nOn = fs.filter((f) => active.includes(f.id) && !(hidden && f.id === mystery?.id)).length;
          return (
            <details key={c} className="fgroup">
              <summary><span>{FAULT_CAT[c]}</span><small>{fs.length} panne{fs.length > 1 ? 's' : ''}{nOn ? ` · ${nOn} en cours` : ''}</small><ChevronDown size={16} aria-hidden className="chev" /></summary>
              <div className="flist">
                {fs.map((f) => {
                  const isOn = active.includes(f.id) && !(hidden && f.id === mystery?.id);
                  return (
                    <button key={f.id} type="button" className={`fbtn ${isOn ? 'on' : ''}`} aria-pressed={isOn} onClick={() => onToggle(f.id)}>
                      <b>{f.label}</b><small>{isOn ? 'en cours — cliquer pour réparer' : 'cliquer pour provoquer'}</small>
                    </button>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
      {(shownActive.length > 0 || hidden) && <button type="button" className="btn full" onClick={onRepairAll}><Wrench size={15} aria-hidden /> Tout réparer et réarmer</button>}
    </section>
  );
}
