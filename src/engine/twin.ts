import {
  ATM_M, M_PER_BAR, etaAt, headAt, hydKw, npshrAt, operatingPoint, optimalSpeed, powerAt,
} from './physics';
import type { Analysis, Diagnostic, Level, Measurement, PumpConfig, Settings } from './types';

/** Seuils (vibrations : ISO 10816-3, machines groupe 2, montage rigide). */
export const LIMITS = {
  devHWarn: -4, devHCrit: -10,
  vibWarn: 4.5, vibCrit: 7.1,
  tempWarn: 80, tempCrit: 95,
  marginWarn: 1, marginCrit: 0.3,
  xLow: 0.7, xHigh: 1.2, xLowCrit: 0.5, xHighCrit: 1.3,
};

/** Compare une mesure au modèle d'une pompe saine. */
export function analyze(cfg: PumpConfig, m: Measurement): Analysis {
  const { spec } = cfg;
  const s = m.n / spec.nn;
  const h = (m.pRef - m.pAsp) * M_PER_BAR;
  const npsha = m.pAsp * M_PER_BAR + ATM_M;
  if (m.q < 0.01 || s < 0.05) {
    return { m, h, hExp: h, devH: 0, eta: 0, etaExp: 0, pExp: 0, devP: 0, x: 0, npsha, npshr: 0, margin: npsha, se: 0 };
  }
  const hExp = headAt(spec, m.q, s);
  const etaExp = etaAt(spec, m.q, s);
  const pExp = powerAt(spec, m.q, hExp, s);
  const eta = m.pElec > 0 ? hydKw(m.q, h) / (m.pElec * spec.etaMotor) : 0;
  const npshr = npshrAt(spec, m.q, s);
  return {
    m, h, hExp,
    devH: ((h - hExp) / hExp) * 100,
    eta: eta * 100,
    etaExp: etaExp * 100,
    pExp,
    devP: pExp > 0 ? ((m.pElec - pExp) / pExp) * 100 : 0,
    x: m.q / (spec.qn * s),
    npsha, npshr,
    margin: npsha - npshr,
    se: m.pElec / m.q,
  };
}

/** Moyenne glissante pour ne pas déclencher d'alerte sur un pic de bruit. */
export function smooth(hist: Analysis[], n = 6): Analysis | null {
  if (!hist.length) return null;
  const w = hist.slice(-n);
  const avg = (f: (a: Analysis) => number) => w.reduce((s, a) => s + f(a), 0) / w.length;
  const last = w[w.length - 1];
  return {
    ...last,
    h: avg((a) => a.h), hExp: avg((a) => a.hExp), devH: avg((a) => a.devH),
    eta: avg((a) => a.eta), etaExp: avg((a) => a.etaExp), pExp: avg((a) => a.pExp),
    devP: avg((a) => a.devP), x: avg((a) => a.x), npsha: avg((a) => a.npsha),
    npshr: avg((a) => a.npshr), margin: avg((a) => a.margin), se: avg((a) => a.se),
    m: {
      ...last.m,
      q: avg((a) => a.m.q), pElec: avg((a) => a.m.pElec), vib: avg((a) => a.m.vib),
      temp: avg((a) => a.m.temp), pAsp: avg((a) => a.m.pAsp), pRef: avg((a) => a.m.pRef),
    },
  };
}

const f1 = (v: number) => v.toFixed(1).replace('.', ',');
const pct = (v: number) => `${v > 0 ? '+' : ''}${f1(v)} %`;

export function diagnose(cfg: PumpConfig, a: Analysis | null): Diagnostic[] {
  if (!a) return [];
  const out: Diagnostic[] = [];
  const L = LIMITS;
  const { spec, system } = cfg;

  if (a.m.q < 0.01 || a.m.n < 1) {
    if (cfg.controls.running && cfg.source === 'sim') {
      out.push({
        id: 'noflow', level: 'critical', title: 'Débit nul pompe en marche',
        cause: 'La pompe ne parvient pas à vaincre la hauteur du réseau, ou elle est désamorcée.',
        evidence: [`Débit mesuré : ${f1(a.m.q)} m³/h`],
        action: 'Arrêter la pompe (risque d\'échauffement), vérifier l\'amorçage, la vanne et la vitesse.',
      });
    } else {
      out.push({ id: 'off', level: 'info', title: 'Pompe à l\'arrêt', cause: 'Aucune mesure de fonctionnement.', evidence: [], action: 'Rien à faire.' });
    }
    return out;
  }

  // 1. Cavitation
  if (a.margin < L.marginWarn) {
    out.push({
      id: 'cavitation',
      level: a.margin < L.marginCrit ? 'critical' : 'warning',
      title: a.margin < L.marginCrit ? 'Cavitation en cours' : 'Risque de cavitation',
      cause: 'Le NPSH disponible est trop proche du NPSH requis : des bulles de vapeur se forment puis implosent sur la roue.',
      evidence: [
        `Marge NPSH : ${f1(a.margin)} m (NPSHd ${f1(a.npsha)} m / NPSHr ${f1(a.npshr)} m)`,
        `Vibrations : ${f1(a.m.vib)} mm/s`,
        `Écart de hauteur : ${pct(a.devH)}`,
      ],
      action: 'Vérifier le niveau d\'aspiration et la crépine, ouvrir la vanne d\'aspiration, réduire le débit ou la vitesse. Une cavitation prolongée érode la roue en quelques semaines.',
    });
  }

  // 2. Aspiration dégradée (avant même la cavitation)
  const npshaDrop = system.npsha - a.npsha;
  if (npshaDrop > 1.5 && a.margin >= L.marginWarn) {
    out.push({
      id: 'suction', level: 'warning', title: 'Aspiration dégradée',
      cause: 'La pression à l\'aspiration est plus basse que la référence de l\'installation.',
      evidence: [`NPSH disponible : ${f1(a.npsha)} m (référence ${f1(system.npsha)} m)`, `Pression aspiration : ${a.m.pAsp.toFixed(2).replace('.', ',')} bar`],
      action: 'Nettoyer la crépine ou le filtre, contrôler le niveau du bassin ou du forage.',
    });
  }

  // 3. Usure hydraulique
  if (a.devH < L.devHWarn && a.margin >= L.marginWarn) {
    out.push({
      id: 'wear',
      level: a.devH < L.devHCrit ? 'critical' : 'warning',
      title: 'Usure hydraulique',
      cause: 'À débit égal, la pompe fournit moins de hauteur que neuve : jeux internes augmentés (bagues d\'usure) ou roue érodée.',
      evidence: [
        `Hauteur : ${f1(a.h)} m au lieu de ${f1(a.hExp)} m (${pct(a.devH)})`,
        `Rendement : ${f1(a.eta)} % au lieu de ${f1(a.etaExp)} %`,
      ],
      action: a.devH < L.devHCrit
        ? 'Planifier le remplacement des bagues d\'usure et le contrôle de la roue dès que possible.'
        : 'Surveiller l\'évolution ; prévoir les bagues d\'usure au prochain arrêt.',
    });
  }

  // 4. Hors plage de fonctionnement
  if (a.x < L.xLow || a.x > L.xHigh) {
    const crit = a.x < L.xLowCrit || a.x > L.xHighCrit;
    const sOpt = optimalSpeed(spec, system);
    let action = a.x < L.xLow
      ? 'La pompe est surdimensionnée pour ce besoin ou étranglée par la vanne.'
      : 'La pompe débite trop : réseau plus ouvert que prévu.';
    if (sOpt && sOpt >= 0.55 && sOpt <= 1.1) {
      const op = operatingPoint(spec, system, sOpt, 100);
      const seNew = (powerAt(spec, op.q, op.h, sOpt) / op.q) * 1000;
      const seNow = a.se * 1000;
      const how = Math.abs(sOpt - 1) < 0.03 && cfg.controls.valvePct < 95
        ? 'ouvrir la vanne à 100 %'
        : `vanne ouverte à 100 % et variateur à ${Math.round(sOpt * 100)} % (${Math.round(spec.nn * sOpt)} tr/min)`;
      action += ` Recommandation : ${how} → ${f1(op.q)} m³/h, ${Math.round(seNew)} Wh/m³ au lieu de ${Math.round(seNow)} Wh/m³.`;
    } else {
      action += ' Envisager une roue rognée ou une pompe mieux adaptée.';
    }
    out.push({
      id: 'bep', level: crit ? 'critical' : 'warning', title: a.x < 1 ? 'Fonctionnement à faible débit' : 'Fonctionnement à fort débit',
      cause: 'Loin du point de meilleur rendement, la pompe consomme plus, vibre plus et s\'use plus vite (recirculation, efforts radiaux).',
      evidence: [`Débit : ${Math.round(a.x * 100)} % du débit optimal (plage conseillée 70–120 %)`, `Ouverture vanne : ${cfg.controls.valvePct} %`],
      action,
    });
  }

  // 5. Mécanique : roulements / désalignement
  const offBep = a.x < L.xLow || a.x > L.xHigh;
  if ((a.m.vib > L.vibWarn && a.margin >= L.marginWarn && !offBep) || a.m.temp > L.tempWarn) {
    const crit = a.m.vib > L.vibCrit || a.m.temp > L.tempCrit;
    out.push({
      id: 'bearing', level: crit ? 'critical' : 'warning', title: 'Défaut mécanique (roulements)',
      cause: 'Vibrations et/ou température palier élevées alors que le point hydraulique est correct : roulement dégradé, lubrification ou désalignement.',
      evidence: [`Vibrations : ${f1(a.m.vib)} mm/s (alerte ${L.vibWarn}, danger ${L.vibCrit})`, `Température palier : ${Math.round(a.m.temp)} °C`],
      action: crit
        ? 'Arrêt programmé rapide : remplacer les roulements, contrôler l\'alignement pompe-moteur.'
        : 'Graisser les roulements, contrôler l\'alignement et le serrage des fixations.',
    });
  }

  // 6. Surcharge moteur
  if (a.m.pElec > spec.motorKw / spec.etaMotor * 1.02) {
    out.push({
      id: 'overload', level: 'warning', title: 'Moteur en surcharge',
      cause: 'La puissance absorbée dépasse la puissance plaquée du moteur.',
      evidence: [`${f1(a.m.pElec)} kW absorbés pour un moteur de ${spec.motorKw} kW`],
      action: 'Réduire le débit (vanne ou variateur) ; vérifier le dimensionnement du moteur.',
    });
  }

  if (!out.length) {
    out.push({
      id: 'ok', level: 'ok', title: 'Fonctionnement normal',
      cause: 'Les mesures correspondent au comportement d\'une pompe saine.',
      evidence: [`Écart hauteur ${pct(a.devH)}`, `Débit à ${Math.round(a.x * 100)} % de l'optimum`, `Vibrations ${f1(a.m.vib)} mm/s`],
      action: 'Aucune action requise.',
    });
  }
  const rank: Record<Level, number> = { critical: 0, warning: 1, info: 2, ok: 3 };
  return out.sort((p, q) => rank[p.level] - rank[q.level]);
}

/** Indice de santé 0–100. */
export function healthScore(a: Analysis | null): number {
  if (!a || a.m.q < 0.01) return a ? 100 : 0;
  const L = LIMITS;
  let s = 100;
  s -= Math.min(30, 2.5 * Math.max(0, -a.devH - 1));
  s -= Math.min(30, Math.max(0, a.m.vib - 2.8) * 6);
  s -= Math.min(25, Math.max(0, 1.5 - a.margin) * 15);
  const dx = Math.max(0, L.xLow - a.x, a.x - L.xHigh);
  s -= Math.min(15, dx * 60);
  s -= Math.min(15, Math.max(0, a.m.temp - 70));
  return Math.max(0, Math.round(s));
}

export function levelOf(score: number): Level {
  return score >= 80 ? 'ok' : score >= 55 ? 'warning' : 'critical';
}

export interface Forecast {
  indicator: string;
  hours: number; // heures avant le seuil critique
  current: string;
  threshold: string;
}

/** Régression linéaire sur l'historique → temps restant avant seuil. */
export function forecast(hist: Analysis[]): Forecast[] {
  const w = hist.filter((a) => a.m.q > 0.01).slice(-72);
  if (w.length < 16) return [];
  const series: { name: string; get: (a: Analysis) => number; thr: number; dir: -1 | 1; unit: string }[] = [
    { name: 'Hauteur (usure)', get: (a) => a.devH, thr: LIMITS.devHCrit, dir: -1, unit: '%' },
    { name: 'Vibrations', get: (a) => a.m.vib, thr: LIMITS.vibCrit, dir: 1, unit: 'mm/s' },
    { name: 'Température palier', get: (a) => a.m.temp, thr: LIMITS.tempCrit, dir: 1, unit: '°C' },
    { name: 'Marge NPSH', get: (a) => a.margin, thr: LIMITS.marginCrit, dir: -1, unit: 'm' },
  ];
  const out: Forecast[] = [];
  for (const ser of series) {
    const xs = w.map((a) => a.m.t);
    const ys = w.map(ser.get);
    const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
    const my = ys.reduce((s, v) => s + v, 0) / ys.length;
    let num = 0, den = 0;
    xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
    if (den === 0) continue;
    const slope = num / den;
    const cur = my + slope * (xs[xs.length - 1] - mx);
    // Erreur-type de la pente : on ignore les « tendances » qui ne sont que du bruit.
    const sse = xs.reduce((s, x, i) => s + (ys[i] - (my + slope * (x - mx))) ** 2, 0);
    const se = Math.sqrt(sse / Math.max(1, xs.length - 2) / den);
    const significant = Math.abs(slope) > 3 * se;
    const already = ser.dir < 0 ? cur <= ser.thr : cur >= ser.thr;
    const moving = significant && (ser.dir < 0 ? slope < 0 : slope > 0);
    if (already) {
      out.push({ indicator: ser.name, hours: 0, current: `${f1(cur)} ${ser.unit}`, threshold: `${f1(ser.thr)} ${ser.unit}` });
    } else if (moving) {
      const h = (ser.thr - cur) / slope;
      if (h > 0 && h < 24 * 365) out.push({ indicator: ser.name, hours: h, current: `${f1(cur)} ${ser.unit}`, threshold: `${f1(ser.thr)} ${ser.unit}` });
    }
  }
  return out.sort((p, q) => p.hours - q.hours);
}

export interface Energy {
  kwhDay: number;
  costDay: number;
  costYear: number;
  seNow: number;
  seOpt: number;
  savingYear: number;
  savingPct: number;
  m3Day: number;
}

/** Coût énergétique et gain possible si la pompe tournait saine au BEP. */
export function energy(cfg: PumpConfig, a: Analysis | null, st: Settings): Energy | null {
  if (!a || a.m.q < 0.01) return null;
  const { spec, system } = cfg;
  const kwhDay = a.m.pElec * st.hoursPerDay;
  const m3Day = a.m.q * st.hoursPerDay;
  // Référence : pompe saine, réglée au mieux (vitesse optimale si variateur possible).
  const sOpt = optimalSpeed(spec, system);
  const s = sOpt && sOpt >= 0.55 && sOpt <= 1.1 ? sOpt : 1;
  const op = operatingPoint(spec, system, s, 100);
  const seOpt = op.q > 0 ? powerAt(spec, op.q, op.h, s) / op.q : a.se;
  // Deux sources de gaspillage : mauvais point de fonctionnement, et rendement dégradé (usure).
  const bySe = Math.max(0, a.se - seOpt) * m3Day * 365;
  const byEta = a.etaExp > 0 ? Math.max(0, 1 - a.eta / a.etaExp) * kwhDay * 365 : 0;
  const kwhSaved = Math.max(bySe, byEta);
  const savingPct = (kwhSaved / (kwhDay * 365)) * 100;
  const keep = savingPct >= 2;
  return {
    kwhDay, m3Day,
    costDay: kwhDay * st.pricePerKwh,
    costYear: kwhDay * 365 * st.pricePerKwh,
    seNow: a.se, seOpt,
    savingYear: keep ? kwhSaved * st.pricePerKwh : 0,
    savingPct: keep ? savingPct : 0,
  };
}
