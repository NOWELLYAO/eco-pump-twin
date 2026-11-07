import { Wand2 } from 'lucide-react';
import { ACCESSORIES, APPS, DN_LIST, FLUIDS, MODES, NEED_LABEL, PIPE_MATS, PUMP_MATS, PUMP_TYPES } from '../catalog';
import { defaultDn, withPipe } from '../evaluate';
import { fluidAt } from '../hydraulics';
import { PRESETS, autoEquip, blank, makeFluid } from '../presets';
import type { AppId, FluidId, Installation, ModeId, Need, PipeMatId, PipeRun, PumpMatId, PumpTypeId } from '../types';
import { NumField, Section, SelField, TextField, Toggle } from './Fields';

const dnOpts = DN_LIST.map((d) => ({ v: d, l: `DN${d}` }));
const pnOpts = [4, 6, 10, 16, 25, 40].map((p) => ({ v: p, l: `PN${p}` }));
const matOpts = (Object.keys(PIPE_MATS) as PipeMatId[]).map((m) => ({ v: m, l: PIPE_MATS[m].label }));

function PipeFields({ run, onChange }: { run: PipeRun; onChange: (r: PipeRun) => void }) {
  return (
    <div className="igrid">
      <SelField label="Matériau" value={run.material} options={matOpts} onChange={(v) => onChange({ ...run, material: v })} wide />
      <SelField label="Diamètre intérieur" value={run.dn} options={dnOpts} onChange={(v) => onChange({ ...run, dn: v })} />
      <SelField label="Pression nominale" value={run.pn} options={pnOpts} onChange={(v) => onChange({ ...run, pn: v })} />
      <NumField label="Longueur" unit="m" value={run.length} onChange={(v) => onChange({ ...run, length: v })} />
      <NumField label="Coudes à 90°" value={run.elbows} onChange={(v) => onChange({ ...run, elbows: Math.round(v) })} />
    </div>
  );
}

const NEED_ORDER: Record<Need, number> = { required: 0, recommended: 1, avoid: 2, optional: 3, na: 9 };

export function InstallerForm({ inst, set, needs }: { inst: Installation; set: (fn: (i: Installation) => Installation) => void; needs: Record<string, Need> }) {
  const i = inst;
  const imm = i.mode === 'immergee';
  const forage = i.pumpType === 'immergee_forage';
  const upd = <K extends keyof Installation>(k: K, v: Installation[K]) => set((x) => ({ ...x, [k]: v }));
  const pump = (p: Partial<Installation['pump']>) => set((x) => ({ ...x, pump: { ...x.pump, ...p } }));
  const geo = (g: Partial<Installation['geo']>) => set((x) => ({ ...x, geo: { ...x.geo, ...g } }));
  const fluid = (f: Partial<Installation['fluid']>) => set((x) => ({ ...x, fluid: { ...x.fluid, ...f } }));
  const duty = (d: Partial<Installation['duty']>) => set((x) => ({ ...x, duty: { ...x.duty, ...d } }));

  const setPumpType = (pt: PumpTypeId) => set((x) => {
    const def = PUMP_TYPES[pt];
    const mode = def.modes.includes(x.mode) ? x.mode : def.modes[0];
    return { ...x, pumpType: pt, mode, pump: { ...x.pump, tmax: def.tmax, passage: def.passage, diameterMm: pt === 'immergee_forage' ? 98 : x.pump.diameterMm } };
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
        <SelField label="Partir d'un exemple" value="" wide
          options={[{ v: '', l: 'Choisir un exemple…' }, ...PRESETS.map((p) => ({ v: p.id, l: p.label })), ...(Object.keys(APPS) as AppId[]).map((a) => ({ v: `blank:${a}`, l: `Vierge — ${APPS[a].label}` }))]}
          onChange={(v) => {
            if (!v) return;
            if (v.startsWith('blank:')) set(() => blank(v.slice(6) as AppId));
            else { const p = PRESETS.find((x) => x.id === v); if (p) set(() => p.build()); }
          }} />
      </div>

      <Section n={1} title="Application et type de pompe" summary={`${APPS[i.app].label} · ${MODES[i.mode].label}`} open>
        <div className="igrid">
          <TextField label="Nom du projet" value={i.name} onChange={(v) => upd('name', v)} wide />
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

      <Section n={3} title="Pompe" summary={`${i.pump.qn} m³/h à ${i.pump.hn} m · ${i.pump.motorKw} kW`}>
        <p className="ihint">Valeurs de la fiche constructeur, au point de meilleur rendement (BEP).</p>
        <div className="igrid">
          <NumField label="Débit nominal" unit="m³/h" value={i.pump.qn} onChange={(v) => v > 0 && pump({ qn: v })} />
          <NumField label="Hauteur nominale" unit="m" value={i.pump.hn} onChange={(v) => v > 0 && pump({ hn: v })} />
          <NumField label="Rendement" unit="%" value={Math.round(i.pump.eta * 100)} onChange={(v) => v > 0 && pump({ eta: Math.min(0.92, v / 100) })} />
          <NumField label="NPSH requis" unit="m" value={i.pump.npshr} onChange={(v) => pump({ npshr: v })} />
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
          {forage && <NumField label="Diamètre de la pompe" unit="mm" value={i.pump.diameterMm} onChange={(v) => pump({ diameterMm: v })} hint="4 pouces ≈ 98 mm, 6 pouces ≈ 142 mm" />}
        </div>
      </Section>

      <Section n={4} title="Site, niveaux et distances" summary={forage ? `Pompe à ${i.geo.pumpDepth} m` : imm ? `Fosse ${i.geo.tankVolume} L` : i.mode === 'aspiration' ? `Aspiration ${i.geo.suctionLift} m` : `En charge ${i.geo.chargeHead} m`}>
        <div className="igrid">
          <NumField label="Altitude du site" unit="m" value={i.geo.altitude} onChange={(v) => geo({ altitude: v })} />
          <NumField label={forage ? 'Point de refoulement au-dessus du sol' : 'Point de refoulement au-dessus de la pompe'} unit="m" min={-50} value={i.geo.hRef} onChange={(v) => geo({ hRef: v })} wide />
          {i.mode === 'aspiration' && <NumField label="Hauteur d'aspiration (niveau mini sous l'axe)" unit="m" value={i.geo.suctionLift} onChange={(v) => geo({ suctionLift: v })} wide />}
          {i.mode === 'charge' && <NumField label="Charge (niveau mini au-dessus de l'axe)" unit="m" value={i.geo.chargeHead} onChange={(v) => geo({ chargeHead: v })} wide />}
          {!imm && (
            <>
              <NumField label="Immersion de l'entrée sous niveau mini" unit="m" value={i.geo.immersion} onChange={(v) => geo({ immersion: v })} />
              <NumField label="Distance entrée / fond" unit="m" value={i.geo.bottom} onChange={(v) => geo({ bottom: v })} />
              <NumField label="Longueur droite avant la pompe" unit="m" value={i.geo.straight} onChange={(v) => geo({ straight: v })} hint="Mini 5 × DN après un coude" wide />
            </>
          )}
          {forage && (
            <>
              <NumField label="Niveau statique" unit="m" value={i.geo.staticLevel} onChange={(v) => geo({ staticLevel: v })} />
              <NumField label="Niveau dynamique" unit="m" value={i.geo.dynamicLevel} onChange={(v) => geo({ dynamicLevel: v })} />
              <NumField label="Profondeur de la pompe" unit="m" value={i.geo.pumpDepth} onChange={(v) => geo({ pumpDepth: v })} />
              <NumField label="Profondeur du forage" unit="m" value={i.geo.boreDepth} onChange={(v) => geo({ boreDepth: v })} />
              <NumField label="Diamètre intérieur du forage" unit="mm" value={i.geo.boreDia} onChange={(v) => geo({ boreDia: v })} wide />
            </>
          )}
          {imm && !forage && (
            <>
              <NumField label="Eau au-dessus de la pompe (arrêt)" unit="m" value={i.geo.wetLevel} onChange={(v) => geo({ wetLevel: v })} />
              <NumField label="Volume utile entre flotteurs" unit="L" value={i.geo.tankVolume} onChange={(v) => geo({ tankVolume: v })} />
            </>
          )}
          <Toggle label="La conduite de refoulement a un point haut" checked={i.geo.highPoint} onChange={(v) => geo({ highPoint: v })} />
        </div>
      </Section>

      {!imm && (
        <Section n={5} title="Conduite d'aspiration" summary={`DN${i.asp.dn} · ${PIPE_MATS[i.asp.material].label} · ${i.asp.length} m`}>
          <PipeFields run={i.asp} onChange={(r) => set((x) => ({ ...withPipe(x, 'asp', r.dn), asp: r }))} />
        </Section>
      )}
      <Section n={imm ? 5 : 6} title="Conduite de refoulement" summary={`DN${i.ref.dn} · ${PIPE_MATS[i.ref.material].label} · ${i.ref.length} m`}>
        {forage && <p className="ihint">Longueur après la tête de forage ; la colonne d'exhaure ({i.geo.pumpDepth} m) est ajoutée automatiquement.</p>}
        <PipeFields run={i.ref} onChange={(r) => set((x) => ({ ...withPipe(x, 'ref', r.dn), ref: r }))} />
      </Section>

      <Section n={imm ? 6 : 7} title="Besoin et énergie" summary={`${i.duty.qReq} m³/h · ${i.duty.pRes} bar`}>
        <div className="igrid">
          <NumField label="Débit demandé" unit="m³/h" value={i.duty.qReq} onChange={(v) => v > 0 && duty({ qReq: v })} />
          <NumField label="Pression au point d'utilisation" unit="bar" value={i.duty.pRes} onChange={(v) => duty({ pRes: v })} />
          <NumField label="Fonctionnement" unit="h/jour" value={i.duty.hoursPerDay} onChange={(v) => duty({ hoursPerDay: Math.min(24, v) })} />
          <NumField label="Prix du kWh" unit={i.duty.currency} value={i.duty.pricePerKwh} onChange={(v) => duty({ pricePerKwh: v })} />
          <SelField label="Devise" value={i.duty.currency} options={['FCFA', 'KES', 'EUR', 'USD', 'MAD', 'GNF', 'CDF', 'XAF'].map((c) => ({ v: c, l: c }))} onChange={(v) => duty({ currency: v })} />
        </div>
      </Section>

      <Section n={imm ? 7 : 8} title="Accessoires d'installation" summary={`${nOn} accessoire(s) installé(s)`} open>
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
                  <div key={a.id} className={`iacc ${on ? 'on' : ''} need-${n} ${n === 'required' && !on ? 'missing' : ''}`}>
                    <label className="iacc-main">
                      <input type="checkbox" checked={on} onChange={(e) => setSt({ on: e.target.checked })} />
                      <span><b>{a.label}</b><small>{a.desc}</small></span>
                      {NEED_LABEL[n] && <em className={`need ${n}`}>{NEED_LABEL[n]}</em>}
                    </label>
                    {on && (a.inline || a.id === 'vessie') && (
                      <div className="iacc-opts">
                        {a.inline && <SelField label="DN" value={st?.dn || defaultDn(i, a.id)} options={dnOpts} onChange={(v) => setSt({ dn: v })} />}
                        {a.id === 'cone_exc' && <SelField label="Méplat" value={st?.opt ?? 'haut'} options={[{ v: 'haut', l: 'En haut' }, { v: 'bas', l: 'En bas' }]} onChange={(v) => setSt({ opt: v })} />}
                        {a.id === 'vessie' && <NumField label="Volume" unit="L" value={st?.vol ?? 100} onChange={(v) => setSt({ vol: v })} />}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </Section>
    </div>
  );
}
