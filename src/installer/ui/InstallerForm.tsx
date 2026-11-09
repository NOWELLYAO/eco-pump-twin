import { MapPin, Wand2 } from 'lucide-react';
import { BACKUP_SIZES, backupApplies, backupCalc, backupMode, backupProposal, floatKind } from '../backup';
import { posAdvice } from '../positions';
import { SolarSite } from './SolarSite';
import { ACCESSORIES, APPS, DN_LIST, FLUIDS, MODES, NEED_LABEL, PIPE_MATS, PUMP_MATS, PUMP_TYPES } from '../catalog';
import { defaultDn, withPipe } from '../evaluate';
import { SECTIONS, START_LABEL, SUPPLY_LABEL, TANK_SIZES, type ElecResult } from '../electrical';
import { fluidAt, solve } from '../hydraulics';
import { aquiferOf, withAquifer } from '../aquifer';
import { fireCfg } from '../fire';
import { FORMATIONS, SLOTS, screenCalc, screenProposal, type FormationId } from '../borehole';
import { PRESETS, autoEquip, blank, fluidForPump, makeFluid } from '../presets';
import { BORE_SIZES, sizeLabel, sizeOf } from '../borepump';
import { fitBore } from '../sizing';
import type { FireCfg, AccState, AppId, FluidId, Installation, ModeId, Need, PipeMatId, PipeRun, PumpMatId, PumpTypeId, StartId, SupplyId } from '../types';
import { NumField, Section, SelField, TextField, Toggle } from './Fields';
import { PumpCurveEditor } from './PumpCurveEditor';
import { isDefault, touch } from '../defaults';

const dnOpts = DN_LIST.map((d) => ({ v: d, l: `DN${d}` }));
const pnOpts = [4, 6, 10, 16, 25, 40].map((p) => ({ v: p, l: `PN${p}` }));
const matOpts = (Object.keys(PIPE_MATS) as PipeMatId[]).map((m) => ({ v: m, l: PIPE_MATS[m].label }));

function PipeFields({ run, onChange, dflt }: { run: PipeRun; onChange: (r: PipeRun) => void; dflt?: boolean }) {
  return (
    <div className="igrid">
      <SelField label="Matériau" value={run.material} options={matOpts} onChange={(v) => onChange({ ...run, material: v })} wide />
      <SelField label="Diamètre intérieur" value={run.dn} options={dnOpts} onChange={(v) => onChange({ ...run, dn: v })} />
      <SelField label="Pression nominale" value={run.pn} options={pnOpts} onChange={(v) => onChange({ ...run, pn: v })} />
      <NumField label="Longueur" unit="m" value={run.length} onChange={(v) => onChange({ ...run, length: v })} dflt={dflt} />
      <NumField label="Coudes à 90°" value={run.elbows} onChange={(v) => onChange({ ...run, elbows: Math.round(v) })} />
    </div>
  );
}

const NEED_ORDER: Record<Need, number> = { required: 0, recommended: 1, avoid: 2, optional: 3, na: 9 };

export function InstallerForm({ inst, set, needs, er }: { inst: Installation; set: (fn: (i: Installation) => Installation) => void; needs: Record<string, Need>; er: ElecResult }) {
  const i = inst;
  const imm = i.mode === 'immergee';
  const forage = i.pumpType === 'immergee_forage';
  const upd = <K extends keyof Installation>(k: K, v: Installation[K]) => set((x) => ({ ...x, [k]: v }));
  const pump = (p: Partial<Installation['pump']>) => set((x) => ({ ...x, pump: { ...x.pump, ...p } }));
  const keys = (pre: string, o: object) => Object.keys(o).map((k) => `${pre}.${k}`);
  const geo = (g: Partial<Installation['geo']>) => set((x) => touch({ ...x, geo: { ...x.geo, ...g } }, keys('geo', g)));
  const D = (k: string) => isDefault(i, k);
  const fluid = (f: Partial<Installation['fluid']>) => set((x) => ({ ...x, fluid: { ...x.fluid, ...f } }));
  const duty = (d: Partial<Installation['duty']>) => set((x) => touch({ ...x, duty: { ...x.duty, ...d } }, keys('duty', d)));
  const elec = (d: Partial<Installation['elec']>) => set((x) => touch({ ...x, elec: { ...x.elec, ...d } }, keys('elec', d)));
  const sol = (d: Partial<Installation['elec']['solar']>) => set((x) => ({ ...x, elec: { ...x.elec, solar: { ...x.elec.solar, ...d } } }));
  const setStart = (st: StartId) => set((x) => ({ ...x, elec: { ...x.elec, start: st }, acc: { ...x.acc, variateur: { ...((x.acc.variateur as AccState | undefined) ?? { dn: 0, qty: 1 }), on: st === 'variateur' } } }));
  const solar = i.elec.supply === 'solaire';
  const fx = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });

  const setPumpType = (pt: PumpTypeId) => set((x) => {
    const def = PUMP_TYPES[pt];
    const mode = def.modes.includes(x.mode) ? x.mode : def.modes[0];
    return fluidForPump({ ...x, pumpType: pt, mode, pump: { ...x.pump, tmax: def.tmax, passage: def.passage, diameterMm: pt === 'immergee_forage' ? 98 : x.pump.diameterMm } }, pt);
  });
  const allPumps = (Object.keys(PUMP_TYPES) as PumpTypeId[]).sort((a, b) => Number(!APPS[i.app].pumps.includes(a)) - Number(!APPS[i.app].pumps.includes(b)));

  const groups: { side: 'asp' | 'ref' | 'ctrl'; title: string }[] = [
    ...(imm ? [] : [{ side: 'asp' as const, title: 'Côté aspiration' }]),
    { side: 'ref', title: 'Côté refoulement' },
    { side: 'ctrl', title: 'Commande et protection' },
  ];
  const nOn = ACCESSORIES.filter((a) => i.acc[a.id]?.on && needs[a.id] !== 'na').length;

  return (
    <div className="iform">
      <div className="ipreset">
        <button type="button" className="btn primary full wz-open" onClick={() => window.dispatchEvent(new Event('open-wizard'))}><Wand2 size={17} aria-hidden /> Conception guidée, pas à pas</button>
        <button type="button" className="btn full" onClick={() => document.querySelector<HTMLButtonElement>('.newbtn')?.click()}>Nouveau projet vide</button>
        <SelField label="Partir d'un exemple" value="" wide
          options={[{ v: '', l: 'Choisir un exemple…' }, ...PRESETS.map((p) => ({ v: p.id, l: p.label })), ...(Object.keys(APPS) as AppId[]).map((a) => ({ v: `blank:${a}`, l: `Vierge — ${APPS[a].label}` }))]}
          onChange={(v) => {
            if (!v) return;
            // Un exemple ouvre un nouveau projet : le projet en cours est conservé
            const n = v.startsWith('blank:') ? blank(v.slice(6) as AppId) : PRESETS.find((x) => x.id === v)?.build();
            if (n) window.dispatchEvent(new CustomEvent('ecopump-new', { detail: n }));
          }} />
      </div>

      <Section n={1} title="Application et type de pompe" summary={`${APPS[i.app].label} · ${MODES[i.mode].label}`} open>
        <div className="igrid">
          <TextField label="Nom du projet" value={i.name} onChange={(v) => set((x) => ({ ...x, name: v, nameAuto: !v.trim() }))} wide />
          <SelField label="Application" value={i.app} wide options={(Object.keys(APPS) as AppId[]).map((a) => ({ v: a, l: APPS[a].label }))}
            onChange={(v) => set((x) => {
              const pt = APPS[v].pumps.includes(x.pumpType) ? x.pumpType : APPS[v].pumps[0];
              const modes = PUMP_TYPES[pt].modes;
              return { ...x, app: v, pumpType: pt, mode: modes.includes(x.mode) ? x.mode : modes[0], fluid: makeFluid(APPS[v].fluid) };
            })} />
          <SelField label="Type de pompe" value={i.pumpType} wide
            options={allPumps.map((p) => ({ v: p, l: `${PUMP_TYPES[p].label}${APPS[i.app].pumps.includes(p) ? '' : ' (inhabituel ici)'}` }))} onChange={setPumpType} />
          <p className="ihint wide">{PUMP_TYPES[i.pumpType].desc}</p>
          <div className="ifld wide">
            <span>Montage</span>
            <div className="iseg">
              {(['aspiration', 'charge', 'immergee'] as ModeId[]).map((m) => (
                <button key={m} type="button" aria-pressed={i.mode === m} disabled={!PUMP_TYPES[i.pumpType].modes.includes(m)} onClick={() => upd('mode', m)} title={MODES[m].desc}>{MODES[m].label}</button>
              ))}
            </div>
            <small>{MODES[i.mode].desc}</small>
          </div>
        </div>
      </Section>

      <Section n={2} title="Fluide pompé" summary={`${FLUIDS[i.fluid.type].label} · ${i.fluid.temp} °C`}>
        <div className="igrid">
          <SelField label="Fluide" value={i.fluid.type} wide options={(Object.keys(FLUIDS) as FluidId[]).map((f) => ({ v: f, l: FLUIDS[f].label }))} onChange={(v) => upd('fluid', makeFluid(v))} />
          <p className="ihint wide">{FLUIDS[i.fluid.type].note}</p>
          <NumField label="Température" unit="°C" min={-10} value={i.fluid.temp} onChange={(t) => fluid({ temp: t, ...fluidAt(i.fluid.type, t) })} />
          <NumField label="Masse volumique" unit="kg/m³" value={i.fluid.rho} onChange={(v) => fluid({ rho: v })} />
          <NumField label="Viscosité" unit="cSt" value={i.fluid.nu} onChange={(v) => fluid({ nu: v })} />
          <NumField label="pH" value={i.fluid.ph} onChange={(v) => fluid({ ph: v })} />
          <NumField label="Matières en suspension" unit="%" value={i.fluid.solidsPct} onChange={(v) => fluid({ solidsPct: v })} />
          <NumField label="Plus grosse particule" unit="mm" value={i.fluid.particleMm} onChange={(v) => fluid({ particleMm: v })} />
          <NumField label="Teneur en sable" unit="g/m³" value={i.fluid.sandGm3} onChange={(v) => fluid({ sandGm3: v })} />
        </div>
      </Section>

      <Section n={3} title="Pompe" summary={`${(i.pump.count ?? 1) > 1 ? `${i.pump.count} × ` : ''}${i.pump.qn} m³/h à ${i.pump.hn} m · ${i.pump.motorKw} kW${(i.pump.standby ?? 0) > 0 ? ` · ${(i.pump.count ?? 1) - (i.pump.standby ?? 0)} en service + ${i.pump.standby} secours` : ''}`}>
        <p className="ihint">{i.pump.usePts ? `Courbe du fabricant active (plus bas) : débit, hauteur, rendement${imm ? '' : ' et NPSH'} nominaux sont recalculés à partir des points.` : 'Valeurs de la fiche constructeur, au point de meilleur rendement (BEP). Pour plus de précision, saisissez la courbe du fabricant plus bas.'}</p>
        <div className="igrid">
          <NumField label="Débit nominal" unit="m³/h" value={i.pump.qn} onChange={(v) => v > 0 && pump({ qn: v })} />
          <NumField label="Hauteur nominale" unit="m" value={i.pump.hn} onChange={(v) => v > 0 && pump({ hn: v })} />
          <NumField label="Rendement" unit="%" value={Math.round(i.pump.eta * 100)} onChange={(v) => v > 0 && pump({ eta: Math.min(0.92, v / 100) })} />
          {!imm && <NumField label="NPSH requis" unit="m" value={i.pump.npshr} onChange={(v) => pump({ npshr: v })} />}
          <SelField label="Vitesse" value={i.pump.nn} options={[960, 1450, 2900, 3500].map((n) => ({ v: n, l: `${n} tr/min` }))} onChange={(v) => pump({ nn: v })} />
          <NumField label="Puissance moteur" unit="kW" value={i.pump.motorKw} onChange={(v) => v > 0 && pump({ motorKw: v })} />
          {!imm && <SelField label="Bride d'aspiration" value={i.pump.dnAsp} options={dnOpts} onChange={(v) => pump({ dnAsp: v })} />}
          <SelField label="Bride de refoulement" value={i.pump.dnRef} options={dnOpts} onChange={(v) => pump({ dnRef: v })} />
          <SelField label="Matériau" value={i.pump.material} options={(Object.keys(PUMP_MATS) as PumpMatId[]).map((m) => ({ v: m, l: PUMP_MATS[m] }))} onChange={(v) => pump({ material: v })} />
          <NumField label="Passage libre" unit="mm" value={i.pump.passage} onChange={(v) => pump({ passage: v })} />
          <NumField label="Température maxi" unit="°C" value={i.pump.tmax} onChange={(v) => pump({ tmax: v })} />
          <NumField label="Sable admissible" unit="g/m³" value={i.pump.sandMax} onChange={(v) => pump({ sandMax: v })} />
          <NumField label="Démarrages maxi" unit="/h" value={i.pump.maxStarts} onChange={(v) => v > 0 && pump({ maxStarts: v })} />
          <NumField label="H à débit nul / H nominale" value={i.pump.shutoff} onChange={(v) => v > 1 && pump({ shutoff: v })} hint="1,1 à 1,4 selon la pompe" />
          {!forage && (
            <>
              <NumField label="Pompes installées en parallèle" value={i.pump.count ?? 1} onChange={(v) => { const c = Math.max(1, Math.min(6, Math.round(v))); pump({ count: c, standby: Math.min(i.pump.standby ?? 0, c - 1) }); }} hint="1 à 6, identiques" />
              <NumField label="Dont en secours" value={i.pump.standby ?? 0} onChange={(v) => pump({ standby: Math.max(0, Math.min((i.pump.count ?? 1) - 1, Math.round(v))) })} hint={`${Math.max(1, (i.pump.count ?? 1) - (i.pump.standby ?? 0))} en service`} />
              {(i.pump.count ?? 1) > 1 && <Toggle label="Permutation automatique des pompes" checked={!!i.pump.alternate} onChange={(v) => pump({ alternate: v })} />}
            </>
          )}
          {forage && (
            <SelField label="Taille de la pompe" value={i.pump.boreIn ?? 0} wide
              options={[{ v: 0, l: `Auto (${sizeOf(i).inch}" ${sizeOf(i).phase})` }, ...BORE_SIZES.map((z) => ({ v: z.inch, l: `${z.inch}" ${z.phase === 'mono' ? 'mono' : 'tri'} · Ø${z.mm} mm · ≤ ${z.qMax} m³/h` }))]}
              onChange={(v: number) => set((x) => fitBore({ ...x, pump: { ...x.pump, boreIn: v || undefined } }))}
              hint={`Sortie DN${i.pump.dnRef} · forage Ø${i.geo.boreDia} mm${sizeOf(i).mm + 10 > i.geo.boreDia ? ' : trop étroit pour cette pompe' : ''}`} />
          )}
        </div>
        <PumpCurveEditor pump={i.pump} npsh={!imm} onChange={(p) => set((x) => ({ ...x, pump: p }))} />
      </Section>

      <Section n={4} title="Site, niveaux et distances" summary={forage ? `Pompe à ${i.geo.pumpDepth} m` : imm ? `Fosse ${i.geo.tankVolume} L` : i.mode === 'aspiration' ? `Aspiration ${i.geo.suctionLift} m` : `En charge ${i.geo.chargeHead} m`}>
        <div className="igrid">
          <NumField label="Altitude du site" unit="m" value={i.geo.altitude} onChange={(v) => geo({ altitude: v })} />
          <NumField label={forage ? 'Point de refoulement au-dessus du sol' : 'Point de refoulement au-dessus de la pompe'} unit="m" min={-50} value={i.geo.hRef} onChange={(v) => geo({ hRef: v })} wide dflt={D('geo.hRef')} />
          {i.mode === 'aspiration' && <NumField label="Hauteur d'aspiration (niveau mini sous l'axe)" unit="m" value={i.geo.suctionLift} onChange={(v) => geo({ suctionLift: v })} wide dflt={D('geo.suctionLift')} />}
          {i.mode === 'charge' && <NumField label="Charge (niveau mini au-dessus de l'axe)" unit="m" value={i.geo.chargeHead} onChange={(v) => geo({ chargeHead: v })} wide dflt={D('geo.chargeHead')} />}
          {!imm && (
            <>
              <NumField label="Immersion de l'entrée sous niveau mini" unit="m" value={i.geo.immersion} onChange={(v) => geo({ immersion: v })} />
              <NumField label="Distance entrée / fond" unit="m" value={i.geo.bottom} onChange={(v) => geo({ bottom: v })} />
              <NumField label="Longueur droite avant la pompe" unit="m" value={i.geo.straight} onChange={(v) => geo({ straight: v })} hint="Mini 5 × DN après un coude" wide />
            </>
          )}
          {forage && (
            <>
              <NumField label="Niveau statique" unit="m" value={i.geo.staticLevel} onChange={(v) => geo({ staticLevel: v })} dflt={D('geo.staticLevel')} />
              <NumField label={(i.geo.boreQ ?? 0) > 0 ? 'Niveau dynamique (à l\'essai)' : 'Niveau dynamique'} unit="m" value={i.geo.dynamicLevel} onChange={(v) => geo({ dynamicLevel: v })} dflt={D('geo.dynamicLevel')} />
              <NumField label="Débit de l'essai de pompage" unit="m³/h" value={i.geo.boreQ ?? 0} onChange={(v) => geo({ boreQ: v > 0 ? v : undefined })} hint="débit auquel le niveau dynamique a été mesuré (0 = inconnu)" wide />
              <AquiferBox i={i} />
              <NumField label="Profondeur de la pompe" unit="m" value={i.geo.pumpDepth} onChange={(v) => geo({ pumpDepth: v })} dflt={D('geo.pumpDepth')} />
              <NumField label="Profondeur du forage" unit="m" value={i.geo.boreDepth} onChange={(v) => geo({ boreDepth: v })} dflt={D('geo.boreDepth')} />
              <NumField label="Diamètre intérieur du forage" unit="mm" value={i.geo.boreDia} onChange={(v) => geo({ boreDia: v })} wide />
              <ScreenFields i={i} geo={geo} />
            </>
          )}
          {imm && !forage && (
            <>
              <NumField label="Eau au-dessus de la pompe (arrêt)" unit="m" value={i.geo.wetLevel} onChange={(v) => geo({ wetLevel: v })} dflt={D('geo.wetLevel')} />
              <NumField label="Volume utile entre flotteurs" unit="L" value={i.geo.tankVolume} onChange={(v) => geo({ tankVolume: v })} dflt={D('geo.tankVolume')} />
            </>
          )}
          <Toggle label="La conduite de refoulement a un point haut" checked={i.geo.highPoint} onChange={(v) => geo({ highPoint: v })} />
        </div>
      </Section>

      {!imm && (
        <Section n={5} title="Conduite d'aspiration" summary={`DN${i.asp.dn} · ${PIPE_MATS[i.asp.material].label} · ${i.asp.length} m`}>
          <PipeFields run={i.asp} dflt={D('asp.length')} onChange={(r) => set((x) => touch({ ...withPipe(x, 'asp', r.dn), asp: r }, r.length !== x.asp.length ? ['asp.length'] : []))} />
        </Section>
      )}
      <Section n={imm ? 5 : 6} title="Conduite de refoulement" summary={`DN${i.ref.dn} · ${PIPE_MATS[i.ref.material].label} · ${i.ref.length} m`}>
        {forage && <p className="ihint">Longueur après la tête de forage ; la colonne d'exhaure ({i.geo.pumpDepth} m) est ajoutée automatiquement.</p>}
        <PipeFields run={i.ref} dflt={D('ref.length')} onChange={(r) => set((x) => touch({ ...withPipe(x, 'ref', r.dn), ref: r }, r.length !== x.ref.length ? ['ref.length'] : []))} />
      </Section>

      <Section n={imm ? 6 : 7} title="Besoin et énergie" summary={`${i.duty.qReq} m³/h · ${i.duty.pRes} bar`}>
        <div className="igrid">
          <NumField label="Débit demandé" unit="m³/h" value={i.duty.qReq} onChange={(v) => v > 0 && duty({ qReq: v })} dflt={D('duty.qReq')} />
          <NumField label="Pression au point d'utilisation" unit="bar" value={i.duty.pRes} onChange={(v) => duty({ pRes: v })} dflt={D('duty.pRes')} />
          <NumField label="Fonctionnement" unit="h/jour" value={i.duty.hoursPerDay} onChange={(v) => duty({ hoursPerDay: Math.min(24, v) })} />
          <NumField label="Prix du kWh" unit={i.duty.currency} value={i.duty.pricePerKwh} onChange={(v) => duty({ pricePerKwh: v })} />
          <SelField label="Devise" value={i.duty.currency} options={['FCFA', 'KES', 'EUR', 'USD', 'MAD', 'GNF', 'CDF', 'XAF'].map((c) => ({ v: c, l: c }))} onChange={(v) => duty({ currency: v })} />
          {i.app === 'incendie' && (() => {
            const fc = fireCfg(i);
            const fu = (p: Partial<FireCfg>) => set((x) => ({ ...x, fire: { ...fireCfg(x), ...p } }));
            const need = (i.duty.qReq * fc.duration) / 60;
            return (
              <>
                <SelField label="Installation incendie" value={fc.kind} wide options={[{ v: 'ria', l: 'Robinets d\'incendie armés (RIA) — NF S 62-201' }, { v: 'sprinkler', l: 'Sprinkleurs — EN 12845 / APSAD R1' }]} onChange={(v) => fu({ kind: v as FireCfg['kind'], duration: v === 'sprinkler' ? 60 : 20 })} />
                <NumField label="Durée d'autonomie exigée" unit="min" value={fc.duration} onChange={(v) => v > 0 && fu({ duration: v })} hint={fc.kind === 'sprinkler' ? '30 (risque léger), 60 (ordinaire), 90 (élevé)' : '20 min en général'} />
                <NumField label="Réserve d'eau incendie disponible" unit="m³" value={fc.reserve ?? 0} onChange={(v) => fu({ reserve: v > 0 ? v : undefined })} hint={`il faut au moins ${need.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} m³ utiles`} />
              </>
            );
          })()}
        </div>
      </Section>

      <Section n={imm ? 7 : 8} title="Électricité et alimentation" summary={`${SUPPLY_LABEL[i.elec.supply]} · ${i.elec.cableSec} mm² · ${i.elec.cableLen} m`}>
        <div className="igrid">
          <SelField label="Alimentation" value={i.elec.supply} wide options={(Object.keys(SUPPLY_LABEL) as SupplyId[]).map((k) => ({ v: k, l: SUPPLY_LABEL[k] }))}
            onChange={(v) => set((x) => ({ ...x, elec: { ...x.elec, supply: v, voltage: v === 'mono' ? 230 : 400, start: v === 'solaire' ? 'variateur' : x.elec.start }, acc: v === 'solaire' ? { ...x.acc, variateur: { ...((x.acc.variateur as AccState | undefined) ?? { dn: 0, qty: 1 }), on: false } } : x.acc }))} />
          <NumField label="Tension moteur" unit="V" value={i.elec.voltage} onChange={(v) => v > 0 && elec({ voltage: v })} />
          <NumField label="Cos φ moteur" value={i.elec.cosphi} onChange={(v) => v > 0.3 && v <= 1 && elec({ cosphi: v })} />
          {!solar && <SelField label="Mode de démarrage" value={i.acc.variateur?.on ? 'variateur' : i.elec.start === 'variateur' ? 'direct' : i.elec.start} wide options={(Object.keys(START_LABEL) as StartId[]).map((k) => ({ v: k, l: START_LABEL[k] }))} onChange={setStart} />}
          <NumField label="Longueur câble coffret → moteur" unit="m" value={i.elec.cableLen} onChange={(v) => elec({ cableLen: v })} wide dflt={D('elec.cableLen')} />
          {!solar && <NumField label="Longueur câble d'arrivée (compteur → coffret)" unit="m" value={i.elec.feedLen ?? 15} onChange={(v) => elec({ feedLen: v })} wide hint={er.feed ? `Arrivée conseillée : ${i.elec.supply === 'mono' ? '3G' : '5G'} ${String(er.feed.sec).replace('.', ',')} mm², protection ${er.feed.rating} A (${fx(er.feed.iTot)} A au total)` : undefined} />}
          <SelField label="Section du câble" value={i.elec.cableSec} options={SECTIONS.map((x) => ({ v: x, l: `${String(x).replace('.', ',')} mm²` }))} onChange={(v) => elec({ cableSec: v })} />
          <SelField label="Conducteur" value={i.elec.cableMat} options={[{ v: 'cu', l: 'Cuivre' }, { v: 'al', l: 'Aluminium' }]} onChange={(v) => elec({ cableMat: v })} />
          <p className="ihint wide elec-hint">
            Courant nominal <b>{fx(er.inom)} A</b>, au démarrage ≈ <b>{fx(er.istart, 0)} A</b>. Chute de tension {fx(er.dropRun)} % en marche.
            Section conseillée : <b>{er.cores} {String(er.secRec).replace('.', ',')} mm²</b>{er.secRec !== i.elec.cableSec && <> </>}{er.secRec !== i.elec.cableSec && <button type="button" className="link" onClick={() => elec({ cableSec: er.secRec })}>appliquer</button>}
          </p>
          {i.elec.supply === 'groupe' && <NumField label="Puissance du groupe" unit="kVA" value={i.elec.genKva} onChange={(v) => elec({ genKva: v })} hint={`Conseillé : ${er.genKva} kVA`} wide />}
        </div>
        {solar && (
          <>
            <h4 className="isub">Emplacement et ensoleillement</h4>
            <SolarSite s={i.elec.solar} set={sol} designMonth={er.solar?.designMonth ?? -1} />
            <h4 className="isub">Champ solaire</h4>
            <div className="igrid">
              <NumField label="Besoin journalier" unit="m³/j" value={i.elec.solar.dailyM3} onChange={(v) => v > 0 && sol({ dailyM3: v })} />
              <NumField label="Puissance d'un panneau" unit="Wc" value={i.elec.solar.panelWc} onChange={(v) => v > 0 && sol({ panelWc: v })} />
              <NumField label="Vmp panneau" unit="V" value={i.elec.solar.vmp} onChange={(v) => v > 0 && sol({ vmp: v })} />
              <NumField label="Voc panneau" unit="V" value={i.elec.solar.voc} onChange={(v) => v > 0 && sol({ voc: v })} />
              <NumField label="Imp panneau" unit="A" value={i.elec.solar.imp} onChange={(v) => v > 0 && sol({ imp: v })} />
              <NumField label="Tension DC maxi contrôleur" unit="V" value={i.elec.solar.vdcMax} onChange={(v) => v > 0 && sol({ vdcMax: v })} />
              <NumField label="Tension MPPT mini" unit="V" value={i.elec.solar.vmpptMin} onChange={(v) => sol({ vmpptMin: v })} />
              <NumField label="Panneaux installés" value={i.elec.solar.panels} onChange={(v) => sol({ panels: Math.round(v) })} hint="0 = calcul automatique" />
              <NumField label="Câble DC (champ → contrôleur)" unit="m" value={i.elec.solar.dcLen} onChange={(v) => sol({ dcLen: v })} />
              <SelField label="Section câble DC" value={i.elec.solar.dcSec} options={SECTIONS.filter((x) => x >= 2.5).map((x) => ({ v: x, l: `${String(x).replace('.', ',')} mm²` }))} onChange={(v) => sol({ dcSec: v })} />
              {er.solar && (
                <p className="ihint wide elec-hint">
                  <b>{er.solar.n} panneaux</b> ({er.solar.ns} en série × {er.solar.np} chaîne{er.solar.np > 1 ? 's' : ''}) = {fx(er.solar.wc / 1000, 2)} kWc, ≈ {fx(er.solar.dailyM3)} m³/jour.
                </p>
              )}
            </div>
          </>
        )}
      </Section>

      <Section n={imm ? 8 : 9} title="Accessoires d'installation" summary={`${nOn} accessoire(s) installé(s)`} open>
        <button type="button" className="btn primary full" onClick={() => set((x) => autoEquip(x))}><Wand2 size={16} aria-hidden /> Équiper automatiquement (requis + conseillés)</button>
        {groups.map((g) => (
          <div key={g.side} className="iacc-group">
            <h4>{g.title}</h4>
            {ACCESSORIES.filter((a) => a.side === g.side && needs[a.id] !== 'na')
              .sort((a, b) => NEED_ORDER[needs[a.id]] - NEED_ORDER[needs[b.id]])
              .map((a) => {
                const st = i.acc[a.id];
                const on = !!st?.on;
                const n = needs[a.id];
                const setSt = (p: Partial<NonNullable<typeof st>>) => set((x) => ({ ...x, acc: { ...x.acc, [a.id]: { on: false, ...((x.acc[a.id] as typeof st | undefined) ?? { dn: defaultDn(x, a.id), qty: 1 }), ...p } } }));
                return (
                  <div key={a.id} data-acc={a.id} className={`iacc ${on ? 'on' : ''} need-${n} ${n === 'required' && !on ? 'missing' : ''}`}>
                    <label className="iacc-main">
                      <input type="checkbox" checked={on} onChange={(e) => setSt({ on: e.target.checked })} />
                      <span><b>{a.label}</b><small>{a.desc}</small></span>
                      {NEED_LABEL[n] && <em className={`need ${n}`}>{NEED_LABEL[n]}</em>}
                    </label>
                    {on && <p className="iacc-pos"><MapPin size={13} aria-hidden /> <span>{posAdvice(a.id, i)}</span></p>}
                    {on && (a.inline || a.id === 'vessie') && (
                      <div className="iacc-opts">
                        {a.inline && <SelField label="DN" value={st?.dn || defaultDn(i, a.id)} options={dnOpts} onChange={(v) => setSt({ dn: v })} />}
                        {a.id === 'cone_exc' && <SelField label="Méplat" value={st?.opt ?? 'haut'} options={[{ v: 'haut', l: 'En haut' }, { v: 'bas', l: 'En bas' }]} onChange={(v) => setSt({ opt: v })} />}
                        {a.id === 'vessie' && er.vessel && (
                          <>
                            <div className="vrec wide2">
                              <b>Conseillé (recalculé en direct)</b>
                              <span>Marche {fx(er.vessel.rec.pOn)} bar · arrêt {fx(er.vessel.rec.pOff)} bar · précharge {fx(er.vessel.rec.pre)} bar · {er.vessel.rec.vol} L PN{er.vessel.rec.pn}</span>
                              <small>Pression nécessaire au refoulement : {fx(er.vessel.pReq)} bar · pompe vanne fermée : {fx(er.vessel.pMax)} bar</small>
                              {!er.vessel.auto || st?.vol != null || st?.pre != null || st?.pn != null ? <button type="button" className="btn primary sm" onClick={() => setSt({ vol: undefined, pn: undefined, pOn: undefined, pOff: undefined, pre: undefined })}>Appliquer les réglages conseillés</button> : <small className="okc">✓ Réglages conseillés appliqués</small>}
                            </div>
                            <NumField label="Enclenchement (marche)" unit="bar" value={er.vessel.pOn} onChange={(v) => setSt({ pOn: v, pOff: er.vessel!.pOff, pre: Math.round((v - 0.2) * 10) / 10 })} />
                            <NumField label="Déclenchement (arrêt)" unit="bar" value={er.vessel.pOff} onChange={(v) => setSt({ pOff: v, pOn: er.vessel!.pOn })} />
                            <NumField label="Précharge (à vide)" unit="bar" value={er.vessel.pre} onChange={(v) => setSt({ pre: v })} />
                            <SelField label="PN" value={er.vessel.pn} options={[6, 8, 10, 16, 25].map((v) => ({ v, l: `PN${v}${v === er.vessel!.pnRec ? ' (conseillé)' : ''}` }))} onChange={(v) => setSt({ pn: v })} />
                            <SelField label="Volume" value={er.vessel.vol} wide options={[...new Set([...TANK_SIZES, er.vessel.vol])].sort((p, q) => p - q).map((v) => {
                              const z = er.vessel!.vfd ? null : er.vessel!.qFill / (4 * (v / 1000) * Math.max(1e-6, er.vessel!.useful));
                              return { v, l: `${v} L${z != null ? ` — ${Math.round(z)} démarrages/h${z <= er.vessel!.zMax ? '' : ' (trop)'}` : ''}${v === er.vessel!.volRec ? ' · conseillé' : ''}` };
                            })} onChange={(v) => setSt({ vol: v })} />
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </Section>

      {forage && <BackupSection i={i} set={set} n={imm ? 9 : 10} />}
    </div>
  );
}

/** Réservoir de secours en by-pass : dimensionnement et réglages (forage). */
function BackupSection({ i, set, n }: { i: Installation; set: (fn: (i: Installation) => Installation) => void; n: number }) {
  const ok = backupApplies(i);
  const b = i.backup;
  const on = !!b?.on && ok;
  const c = backupCalc(i, b ?? backupProposal(i));
  const upd = (p: Partial<NonNullable<Installation['backup']>>) => set((x) => ({ ...x, backup: { ...(x.backup ?? backupProposal(x)), ...p } }));
  const f1 = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
  return (
    <Section n={n} title="Réservoir surélevé (château d'eau)" summary={on ? `${backupMode(b) === 'serie' ? 'En série' : 'Secours'} · ${b!.volume.toLocaleString('fr-FR')} L à ${b!.height} m · ${f1(c.autonomyH, 0)} h de réserve` : ok ? 'Non installé' : 'Sans objet ici'}>
      {!ok ? (
        <p className="ihint">Sans pressostat ni variateur, le forage remplit déjà un réservoir qui alimente le réseau par gravité : pas besoin de by-pass. Le réservoir de secours sert quand le forage alimente directement la maison sous pression.</p>
      ) : (
        <>
          <p className="ihint">{!on || backupMode(b) === 'serie'
            ? <>La pompe remplit le réservoir par un robinet à flotteur, la maison est <b>toujours servie par le réservoir</b> (gravité). Réservoir plein, le flotteur ferme : la pression monte et le pressostat arrête la pompe. Le niveau baisse, le flotteur s'ouvre : la pression tombe et le pressostat relance la pompe. En cas de panne ou de coupure, la maison continue d'être servie tant qu'il reste de l'eau.</>
            : <>La pompe alimente la maison sous pression et remplit le réservoir en by-pass. Sa sortie passe par une électrovanne normalement ouverte tenue fermée par le coffret : en cas de coupure, de disjonction, de manque d'eau ou de pression restée basse, elle s'ouvre et le réservoir sert la maison par gravité.</>}</p>
          <Toggle label="Installer un réservoir surélevé" checked={on} onChange={(v) => set((x) => ({ ...x, backup: v ? { ...(x.backup ?? backupProposal(x)), on: true } : { ...(x.backup ?? backupProposal(x)), on: false } }))} />
          {on && b && (
            <div className="igrid">
              <SelField label="Fonctionnement" value={backupMode(b)} options={[{ v: 'serie', l: 'En série : la maison est servie par le réservoir' }, { v: 'secours', l: 'Secours : la pompe sert la maison, réservoir en by-pass' }]} onChange={(v) => upd({ mode: v as 'serie' | 'secours' })} />
              {backupMode(b) === 'serie' && <SelField label="Robinet à flotteur" value={floatKind(b)} options={[{ v: 'differentiel', l: 'À niveau différentiel (conseillé : longs cycles)' }, { v: 'modulant', l: 'Classique (s\'entrouvre au moindre puisage)' }]} onChange={(v) => upd({ float: v as 'differentiel' | 'modulant' })} />}
              {backupMode(b) === 'serie' && floatKind(b) === 'differentiel' && <NumField label="Réouverture du flotteur" unit="%" value={b.low ?? 80} onChange={(v) => v >= 30 && v <= 95 && upd({ low: v })} hint="niveau auquel le remplissage reprend (la pompe redémarre)" />}
              <NumField label="Autonomie souhaitée" unit="h" value={b.autonomyH} onChange={(v) => v > 0 && upd({ autonomyH: Math.min(96, v) })} hint={`consommation moyenne ≈ ${f1(c.avgM3h, 2)} m³/h (${f1(c.dailyM3, 0)} m³/jour)`} />
              <SelField label="Volume du réservoir" value={b.volume} options={[...new Set([...BACKUP_SIZES, b.volume])].sort((p, q) => p - q).map((v) => ({ v, l: `${v.toLocaleString('fr-FR')} L${v === c.volRec ? ' (conseillé)' : ''}` }))} onChange={(v) => upd({ volume: v })} />
              <NumField label="Hauteur sous le réservoir" unit="m" value={b.height} onChange={(v) => v >= 0 && upd({ height: Math.min(30, v) })} hint={`mini ${c.hMin} m · conseillé ${c.hRec} m (château d'eau, tour ou toit)`} />
              <div className="vrec wide2">
                <b>Résultat</b>
                <span>Réserve {f1(c.autonomyH, 1)} h · {f1(c.pHouse, 1)} bar aux robinets{backupMode(b) === 'serie' ? '' : ' en secours'} · remplissage complet ≈ {f1(c.fillH, 1)} h</span>
                {backupMode(b) === 'serie'
                  ? <small>Robinet à flotteur DN{c.fillDn} ({f1(c.fillM3h, 1)} m³/h) · descente DN{c.outDn} vers la maison · charge du réservoir en tête de forage {f1(c.headTop)} bar : le pressostat doit relancer au-dessus ({f1(c.headTop + 0.3)} bar mini) · by-pass direct (fermé) pour l'entretien · trop-plein et vidange</small>
                  : <small>Robinet à flotteur DN{c.fillDn} sur le by-pass ({f1(c.fillM3h, 1)} m³/h) · sortie DN{c.outDn} par électrovanne normalement ouverte + clapet anti-retour · remplissage dès {f1(c.headTop)} bar en tête de forage · trop-plein et vidange</small>}
                {(b.volume !== c.volRec || b.height < c.hMin) && <button type="button" className="btn primary sm" onClick={() => upd({ volume: c.volRec, height: Math.max(b.height, c.hRec) })}>Appliquer le dimensionnement conseillé</button>}
              </div>
            </div>
          )}
        </>
      )}
    </Section>
  );
}

/** Ce que la nappe permet : capacité spécifique, niveau au débit réel de la pompe, débits maxi et conseillé. */
function AquiferBox({ i }: { i: Installation }) {
  const f1 = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
  const ie = withAquifer(i);
  const h = solve(ie);
  const a = aquiferOf(ie, h.q);
  if (!a) return null;
  if (!a.known) return <p className="ihint wide2">Renseignez le débit de l'essai : on en déduit ce que le forage peut donner, le niveau réel de l'eau au débit de la pompe et le débit à ne pas dépasser.</p>;
  const above = ie.geo.pumpDepth - ie.geo.dynamicLevel;
  const bad = h.q > a.qMax + 0.05 || above < 2;
  return (
    <div className={`vrec wide2${bad ? ' bad' : ''}`}>
      <b>Nappe</b>
      <span>Capacité spécifique {f1(a.c, 2)} m³/h par mètre · débit maxi ≈ {f1(a.qMax)} m³/h · exploitation conseillée {f1(a.qExp)} m³/h</span>
      <small>À {f1(h.q)} m³/h (débit de la pompe), l'eau se stabilise à {f1(ie.geo.dynamicLevel)} m, {above > 0 ? `${f1(above)} m au-dessus de la pompe` : 'sous l\'entrée de la pompe'}{bad ? ' : trop peu, la pompe va se dénoyer.' : '.'}</small>
    </div>
  );
}

/** Crépine du forage (rapport de forage) : position, fentes, terrain, massif filtrant. */
function ScreenFields({ i, geo }: { i: Installation; geo: (p: Partial<Installation['geo']>) => void }) {
  const sc = i.geo.screen;
  const f1 = (v: number, d = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: d });
  const up = (p: Partial<NonNullable<Installation['geo']['screen']>>) => geo({ screen: { ...(sc ?? screenProposal(i)), ...p } });
  const ie = withAquifer(i);
  const h = solve(ie);
  const c = sc && sc.bottom > sc.top ? screenCalc(ie, sc, h.q) : null;
  return (
    <>
      <div className="ifld wide"><Toggle label="Je connais la crépine du forage (rapport de forage)" checked={!!sc} onChange={(v) => geo({ screen: v ? screenProposal(i) : undefined })} /></div>
      {sc && (
        <>
          <NumField label="Haut de la crépine" unit="m" value={sc.top} onChange={(v) => up({ top: v })} />
          <NumField label="Bas de la crépine" unit="m" value={sc.bottom} onChange={(v) => up({ bottom: v })} />
          <SelField label="Ouverture des fentes" value={sc.slot} options={[...new Set([...SLOTS, sc.slot])].sort((a, b) => a - b).map((v) => ({ v, l: `${f1(v, 2)} mm` }))} onChange={(v) => up({ slot: v })} />
          <SelField label="Type de crépine" value={sc.type} options={[{ v: 'pvc', l: 'PVC fendue' }, { v: 'inox', l: 'Inox à fil enroulé (Johnson)' }]} onChange={(v) => up({ type: v as 'pvc' | 'inox' })} />
          <SelField label="Terrain capté (granulométrie)" value={sc.formation} options={(Object.keys(FORMATIONS) as FormationId[]).map((k) => ({ v: k, l: FORMATIONS[k].label }))} onChange={(v) => up({ formation: v as FormationId })} wide />
          <div className="ifld wide"><Toggle label="Massif filtrant (gravier calibré autour de la crépine)" checked={sc.pack} onChange={(v) => up({ pack: v })} /></div>
          {c && (
            <div className={`vrec wide2${c.pos !== 'above' || c.dewater > 0.5 || c.vIn > 0.03 || c.slotK > 1.5 ? ' bad' : ''}`}>
              <b>Crépine</b>
              <span>Pompe {c.pos === 'above' ? `${f1(c.gap)} m au-dessus de la crépine` : c.pos === 'inside' ? 'DANS la zone crépinée' : 'SOUS la crépine (décanteur)'} · {c.dewater > 0.5 ? `${f1(c.dewater)} m de crépine dénoyés en pompage` : 'crépine noyée en pompage'} · vitesse d'entrée {f1(c.vIn * 100, 1)} cm/s (maxi 3)</span>
              <small>Fentes conseillées {f1(c.slotRec, 2)} mm pour ce terrain{sc.pack ? ' avec massif' : ' sans massif'} ({c.slotK > 1.5 ? 'les vôtres laissent passer le sable' : c.slotK < 0.6 ? 'les vôtres sont fines : colmatage plus rapide' : 'les vôtres conviennent'}) · débit maxi pour 3 cm/s : {f1(c.qVmax)} m³/h · {f1(c.sump)} m sous la pompe</small>
            </div>
          )}
        </>
      )}
    </>
  );
}
