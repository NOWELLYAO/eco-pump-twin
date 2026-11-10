/** Son de la pompe (Web Audio) : moteur, écoulement et bruits de panne synthétisés en direct.
 *  Démarré uniquement par un geste de l'utilisateur (règle des navigateurs). */
import type { Acoustic } from '../installer/sim';

type Ch = { g: GainNode; target: number };
let ac: AudioContext | null = null;
let master: GainNode | null = null;
const ch: Record<string, Ch> = {};
let timer: number | null = null;
let last: { a: Acoustic; on: boolean; hz: number } | null = null;

function noiseBuffer(ctx: AudioContext) {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let k = 0; k < d.length; k++) d[k] = Math.random() * 2 - 1;
  return b;
}
function noiseSrc(ctx: AudioContext, buf: AudioBuffer) { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.start(); return s; }
function chan(name: string, input: AudioNode) { const g = ac!.createGain(); g.gain.value = 0; input.connect(g); g.connect(master!); ch[name] = { g, target: 0 }; return g; }

export function soundOn() {
  if (ac) { ac.resume(); if (timer == null) timer = window.setInterval(tick, 45); return; }
  ac = new AudioContext();
  master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
  const nb = noiseBuffer(ac);
  // Moteur : 2 × fréquence réseau (100 Hz magnétique) + vitesse de rotation (≈ 48 Hz), adoucis
  const m1 = ac.createOscillator(); m1.type = 'sawtooth'; m1.frequency.value = 100;
  const m2 = ac.createOscillator(); m2.type = 'triangle'; m2.frequency.value = 48;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
  m1.connect(lp); m2.connect(lp); m1.start(); m2.start(); chan('moteur', lp);
  (ch.moteur as Ch & { o?: OscillatorNode[] }).o = [m1, m2];
  // Écoulement : souffle filtré
  const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 700; fl.Q.value = 0.6; noiseSrc(ac, nb).connect(fl); chan('ecoulement', fl);
  // Cavitation : crépitement aigu (rafales aléatoires)
  const cv = ac.createBiquadFilter(); cv.type = 'highpass'; cv.frequency.value = 2200; noiseSrc(ac, nb).connect(cv); chan('cavitation', cv);
  // Roulements : grondement modulé
  const rb = ac.createBiquadFilter(); rb.type = 'bandpass'; rb.frequency.value = 3400; rb.Q.value = 4; noiseSrc(ac, nb).connect(rb); chan('roulements', rb);
  // Ronflement / magnétique : 50 et 100 Hz carrés
  const hm = ac.createOscillator(); hm.type = 'square'; hm.frequency.value = 50; const hl = ac.createBiquadFilter(); hl.type = 'lowpass'; hl.frequency.value = 300; hm.connect(hl); hm.start(); chan('ronflement', hl);
  const mg = ac.createOscillator(); mg.type = 'sine'; mg.frequency.value = 100; mg.start(); chan('magnetique', mg);
  // Sifflement (marche à sec, inversion) : sinus aigu
  const sf = ac.createOscillator(); sf.type = 'sine'; sf.frequency.value = 1900; sf.start(); chan('sifflement', sf);
  // Gargouillement (air) : bas médium, haché
  const gg = ac.createBiquadFilter(); gg.type = 'bandpass'; gg.frequency.value = 320; gg.Q.value = 2; noiseSrc(ac, nb).connect(gg); chan('gargouillement', gg);
  // Barattage / recirculation : souffle grave
  const br = ac.createBiquadFilter(); br.type = 'lowpass'; br.frequency.value = 260; noiseSrc(ac, nb).connect(br); chan('barattage', br);
  // Sable : crissement
  const sb = ac.createBiquadFilter(); sb.type = 'highpass'; sb.frequency.value = 5200; noiseSrc(ac, nb).connect(sb); chan('sable', sb);
  // Chocs (cognement, claquement, balourd) : coups graves déclenchés au rythme de la rotation
  const kn = ac.createBiquadFilter(); kn.type = 'lowpass'; kn.frequency.value = 180; noiseSrc(ac, nb).connect(kn); chan('choc', kn);
  // Groupe électrogène diesel : explosions du moteur (≈ 50 Hz à 1500 tr/min) + souffle grave, modulés au régime
  const ge = ac.createOscillator(); ge.type = 'sawtooth'; ge.frequency.value = 50;
  const gn = ac.createBiquadFilter(); gn.type = 'lowpass'; gn.frequency.value = 160; noiseSrc(ac, nb).connect(gn);
  const gl = ac.createBiquadFilter(); gl.type = 'lowpass'; gl.frequency.value = 240; ge.connect(gl); gn.connect(gl); ge.start();
  chan('groupe', gl); (ch.groupe as Ch & { o?: OscillatorNode[] }).o = [ge];
  timer = window.setInterval(tick, 45);
}

export function soundOff() { if (ac) ac.suspend(); if (timer != null) { window.clearInterval(timer); timer = null; } }
export const soundActive = () => !!ac && ac.state === 'running';

/** Met à jour le son d'après l'état acoustique simulé. */
export function soundUpdate(a: Acoustic, on: boolean, hz = 50) { last = { a, on, hz }; }

function tick() {
  if (!ac || !last) return;
  const t = ac.currentTime;
  const lvl = (k: string) => last!.a.sources.filter((s) => s.kind === k).reduce((m, s) => Math.max(m, s.level), 0);
  const sp = Math.max(0.3, last.hz / 50);
  const o = (ch.moteur as Ch & { o?: OscillatorNode[] }).o; if (o) { o[0].frequency.setTargetAtTime(100 * Math.min(1, sp + 0.2), t, 0.2); o[1].frequency.setTargetAtTime(48 * sp, t, 0.2); }
  const rnd = Math.random();
  const set = (k: string, v: number, tc = 0.12) => ch[k]?.g.gain.setTargetAtTime(v, t, tc);
  set('moteur', lvl('moteur') * 0.16);
  set('ecoulement', lvl('ecoulement') * 0.10);
  set('cavitation', lvl('cavitation') * (rnd < 0.45 ? 0.35 : 0.04), 0.01);
  set('roulements', lvl('roulements') * (0.12 + 0.1 * Math.sin(t * 60)), 0.02);
  set('ronflement', lvl('ronflement') * 0.12);
  set('magnetique', lvl('magnetique') * 0.06);
  set('sifflement', lvl('sifflement') * 0.025);
  set('gargouillement', (lvl('gargouillement')) * (rnd < 0.3 ? 0.5 : 0.03), 0.02);
  set('barattage', Math.max(lvl('barattage'), lvl('recirculation')) * 0.25);
  set('sable', lvl('sable') * 0.12);
  // Diesel : battement à 12,5 Hz (cycle des 4 cylindres) pour le côté « tac-tac » du groupe
  const gLvl = lvl('groupe');
  const go = (ch.groupe as Ch & { o?: OscillatorNode[] }).o; if (go) go[0].frequency.setTargetAtTime(gLvl > 0 ? 46 + gLvl * 6 : 50, t, 0.3);
  set('groupe', gLvl * (0.16 + 0.07 * Math.sin(t * 2 * Math.PI * 12.5)), 0.01);
  // Chocs : à chaque « tour » perceptible (≈ 6 par seconde) pour cognement / balourd, irréguliers pour claquement
  const knock = Math.max(lvl('cognement'), lvl('balourd') * 0.7), clack = lvl('claquement');
  const g = ch.choc?.g.gain;
  if (g && ((knock > 0 && Math.floor(t * 6) !== Math.floor((t - 0.045) * 6)) || (clack > 0 && rnd < 0.06))) {
    g.cancelScheduledValues(t); g.setValueAtTime(Math.max(knock, clack) * 0.9, t); g.exponentialRampToValueAtTime(0.001, t + 0.09);
  }
}
