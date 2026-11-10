import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, FileImage, RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { calOk, sample, toVal, trace, yAt, type AxisCal, type Px } from '../digitize';
import type { PPt } from '../pumpcurve';

/** Résultat de la lecture d'une fiche : points de courbe et caractéristiques de la pompe. */
export interface CurveImportResult { pts: PPt[]; motorKw?: number; nn?: number; model?: string }

type Curve = 'h' | 'e' | 'n';
type Step = 'load' | 'qx' | 'hy' | 'h' | 'ey' | 'e' | 'ny' | 'n' | 'info';
const STEPS: { id: Step; t: string; help: string }[] = [
  { id: 'qx', t: 'Axe des débits', help: 'Touchez deux graduations de l\'axe horizontal des débits (ex. 0 et la dernière), et indiquez leur valeur en m³/h.' },
  { id: 'hy', t: 'Axe des hauteurs', help: 'Touchez deux graduations de l\'axe vertical des hauteurs (ex. 0 et la plus haute), et indiquez leur valeur en m.' },
  { id: 'h', t: 'Courbe H(Q)', help: 'Touchez la courbe de hauteur : elle est suivie automatiquement sur toute sa longueur.' },
  { id: 'ey', t: 'Axe du rendement', help: 'Facultatif. Touchez deux graduations de l\'axe du rendement (souvent à droite, en %) et indiquez leur valeur.' },
  { id: 'e', t: 'Courbe de rendement', help: 'Touchez la courbe du rendement de la pompe (la plus haute s\'il y en a deux : l\'autre inclut le moteur).' },
  { id: 'ny', t: 'Axe du NPSH', help: 'Facultatif. Touchez deux graduations de l\'axe du NPSH (graphique du bas, en m) et indiquez leur valeur.' },
  { id: 'n', t: 'Courbe NPSH requis', help: 'Touchez la courbe du NPSH requis.' },
  { id: 'info', t: 'Moteur et vitesse', help: 'Recopiez la puissance du moteur et la fréquence indiquées sur la fiche.' },
];
const yStep: Record<'hy' | 'ey' | 'ny', Curve> = { hy: 'h', ey: 'e', ny: 'n' };

async function loadPdf(file: File): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale: 2.5 });
  const cv = document.createElement('canvas');
  cv.width = vp.width; cv.height = vp.height;
  const ctx = cv.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return cv;
}
async function loadImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => { img.onload = () => ok(); img.onerror = () => ko(new Error('Image illisible')); img.src = url; });
    const cv = document.createElement('canvas');
    cv.width = img.naturalWidth; cv.height = img.naturalHeight;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
    ctx.drawImage(img, 0, 0);
    return cv;
  } finally { URL.revokeObjectURL(url); }
}

const r1 = (v: number, d = 10) => Math.round(v * d) / d;
const num = (s: string) => { const v = Number(s.replace(',', '.').trim()); return s.trim() !== '' && Number.isFinite(v) ? v : NaN; };

export function CurveImport({ onApply, onClose }: { onApply: (r: CurveImportResult) => void; onClose: () => void }) {
  const [src, setSrc] = useState<HTMLCanvasElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>('load');
  const [zoom, setZoom] = useState(1);
  const [tol, setTol] = useState(0.5);
  const [qx, setQx] = useState<Partial<AxisCal>>({});
  const [ys, setYs] = useState<Record<Curve, Partial<AxisCal>>>({ h: {}, e: {}, n: {} });
  const [tr, setTr] = useState<Record<Curve, Px[]>>({ h: [], e: [], n: [] });
  const [manual, setManual] = useState(false);
  const [last, setLast] = useState<Px | null>(null); // dernier repère posé (à ajuster / à chiffrer)
  const [val, setVal] = useState('');
  const [info, setInfo] = useState({ kw: '', hz: '50', model: '', to50: true });
  const cvRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const data = useMemo(() => (src ? src.getContext('2d')!.getImageData(0, 0, src.width, src.height) : null), [src]);

  const open = async (f: File | undefined) => {
    if (!f) return;
    setErr(null); setBusy(true);
    try {
      const cv = /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name) ? await loadPdf(f) : await loadImage(f);
      setSrc(cv); setStep('qx'); setQx({}); setYs({ h: {}, e: {}, n: {} }); setTr({ h: [], e: [], n: [] }); setLast(null); setZoom(1);
      // Fréquence indiquée dans le nom du fichier ou absente : 50 Hz par défaut
      if (/60\s?hz/i.test(f.name)) setInfo((x) => ({ ...x, hz: '60' }));
    } catch (e) { setErr((e as Error).message || 'Fichier illisible'); } finally { setBusy(false); }
  };

  // ---- Dessin : image + repères + courbes suivies ----
  const scale = () => { const w = wrapRef.current?.clientWidth ?? 340; return src ? (w * zoom) / src.width : 1; };
  useEffect(() => {
    const cv = cvRef.current; if (!cv || !src) return;
    const k = scale();
    // Écran haute définition : canvas dessiné à la résolution réelle de l'écran (net sur téléphone)
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = Math.round(src.width * k), ch = Math.round(src.height * k);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    cv.style.width = `${cw}px`; cv.style.height = `${ch}px`;
    const g = cv.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, 0, 0, cw, ch);
    const dot = (p: Px, color: string, r = 5) => { g.beginPath(); g.arc(p.x * k, p.y * k, r, 0, 7); g.fillStyle = color; g.fill(); g.lineWidth = 2; g.strokeStyle = '#fff'; g.stroke(); };
    const vline = (p: number, color: string) => { g.strokeStyle = color; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(p * k, 0); g.lineTo(p * k, ch); g.stroke(); g.setLineDash([]); };
    const hline = (p: number, color: string) => { g.strokeStyle = color; g.setLineDash([5, 4]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, p * k); g.lineTo(cw, p * k); g.stroke(); g.setLineDash([]); };
    if (qx.p1 != null) vline(qx.p1, '#d9480f'); if (qx.p2 != null) vline(qx.p2, '#d9480f');
    const col: Record<Curve, string> = { h: '#1971c2', e: '#2f9e44', n: '#ae3ec9' };
    for (const c of ['h', 'e', 'n'] as Curve[]) {
      const a = ys[c];
      if ((step === `${c}y` || step === c) && a.p1 != null) hline(a.p1, col[c]);
      if ((step === `${c}y` || step === c) && a.p2 != null) hline(a.p2, col[c]);
      const t = tr[c]; if (t.length < 2) continue;
      g.strokeStyle = col[c]; g.lineWidth = 3; g.globalAlpha = 0.75; g.beginPath();
      t.forEach((p, n) => (n ? g.lineTo(p.x * k, p.y * k) : g.moveTo(p.x * k, p.y * k))); g.stroke(); g.globalAlpha = 1;
      for (const p of sample(t, 8)) dot(p, col[c], 4);
    }
    if (last) dot(last, '#e8590c', 6);
  });

  const cur: Curve | null = step === 'h' || step === 'e' || step === 'n' ? step : null;
  const axisStep = step === 'qx' || step === 'hy' || step === 'ey' || step === 'ny';
  const axisNow: Partial<AxisCal> = step === 'qx' ? qx : step === 'hy' || step === 'ey' || step === 'ny' ? ys[yStep[step]] : {};
  const waitingVal = axisStep && last != null;

  const tap = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!data) return;
    const r = e.currentTarget.getBoundingClientRect(), k = scale();
    const p = { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k };
    if (axisStep) {
      if (waitingVal) return; // d'abord la valeur du repère précédent
      setLast(p); setVal(axisNow.p1 == null ? '0' : '');
    } else if (cur) {
      const xMin = calOk(qx) ? Math.min(qx.p1, qx.p2) - 3 : 0;
      if (manual) setTr((t) => ({ ...t, [cur]: [...t[cur], p].sort((a, b) => a.x - b.x) }));
      else setTr((t) => ({ ...t, [cur]: trace(data, p, { tol, xMin }) }));
    }
  };
  const nudge = (dx: number, dy: number) => setLast((p) => (p ? { x: p.x + dx, y: p.y + dy } : p));
  const confirmVal = () => {
    const v = num(val); if (!last || !Number.isFinite(v)) return;
    if (step === 'qx') setQx((a) => (a.p1 == null ? { p1: last.x, v1: v } : { ...a, p2: last.x, v2: v }));
    else if (step === 'hy' || step === 'ey' || step === 'ny') { const c = yStep[step]; setYs((s) => ({ ...s, [c]: s[c].p1 == null ? { p1: last.y, v1: v } : { ...s[c], p2: last.y, v2: v } })); }
    setLast(null); setVal('');
  };
  const resetStep = () => {
    setLast(null);
    if (step === 'qx') setQx({});
    else if (step === 'hy' || step === 'ey' || step === 'ny') setYs((s) => ({ ...s, [yStep[step]]: {} }));
    else if (cur) setTr((t) => ({ ...t, [cur]: [] }));
  };
  const idx = STEPS.findIndex((s) => s.id === step);
  const go = (to: Step) => { setLast(null); setManual(false); setStep(to); };
  const canNext = step === 'qx' ? calOk(qx) : step === 'hy' ? calOk(ys.h) : step === 'h' ? tr.h.length >= 2 : true;
  const skipOpt = step === 'ey' || step === 'e' ? 'ny' : step === 'ny' || step === 'n' ? 'info' : null;

  // ---- Valeurs lues ----
  const pts: PPt[] = useMemo(() => {
    if (!calOk(qx) || !calOk(ys.h) || tr.h.length < 2) return [];
    return sample(tr.h, 8).map((p) => {
      const q = Math.max(0, toVal(qx, p.x)), h = toVal(ys.h as AxisCal, p.y);
      const ye = calOk(ys.e) ? yAt(tr.e, p.x) : null, yn = calOk(ys.n) ? yAt(tr.n, p.x) : null;
      return { q: r1(q, 100), h: r1(h), eta: ye != null ? r1(toVal(ys.e as AxisCal, ye)) : undefined, npshr: yn != null ? r1(toVal(ys.n as AxisCal, yn), 100) : undefined };
    }).filter((p) => p.h > 0);
  }, [qx, ys, tr]);
  const hz = Number(info.hz) || 50;
  const conv = hz === 60 && info.to50; // courbe 60 Hz ramenée au réseau 50 Hz (lois de similitude)
  const k5 = 50 / 60;
  const outPts = conv ? pts.map((p) => ({ ...p, q: r1(p.q * k5, 100), h: r1(p.h * k5 * k5), npshr: p.npshr != null ? r1(p.npshr * k5 * k5, 100) : undefined })) : pts;
  const apply = () => {
    const kw = num(info.kw);
    onApply({ pts: outPts, motorKw: Number.isFinite(kw) && kw > 0 ? kw : undefined, nn: conv || hz === 50 ? 2900 : 3500, model: info.model.trim() || undefined });
  };

  return createPortal(
    <div className="backdrop cimp-bd" onClick={onClose}>
      <div className="modal cimp" role="dialog" aria-modal aria-label="Lire une courbe de pompe" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2><FileImage size={18} aria-hidden /> Lire une fiche de pompe</h2><button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button></div>

        {step === 'load' ? (
          <div className="cimp-load">
            <p>Chargez la courbe de la pompe : capture d'écran ou photo de la fiche (Grundfos, Pedrollo, Lowara…), ou le PDF du fabricant. L'application lit ensuite la courbe de hauteur, le rendement et le NPSH : vous indiquez seulement deux graduations par axe, puis vous touchez chaque courbe.</p>
            <label className="btn primary full">
              <FileImage size={16} aria-hidden /> {busy ? 'Ouverture…' : 'Choisir une image ou un PDF'}
              <input type="file" accept="image/*,application/pdf,.pdf" hidden onChange={(e) => open(e.target.files?.[0])} />
            </label>
            {err && <p className="note err">{err}</p>}
          </div>
        ) : (
          <>
            <ol className="cimp-steps">{STEPS.map((s, n) => <li key={s.id} className={s.id === step ? 'on' : n < idx ? 'done' : ''}>{n + 1}</li>)}</ol>
            <div className="cimp-help"><b>{STEPS[idx]?.t}</b> — {STEPS[idx]?.help}
              {axisStep && <small> Repères posés : {axisNow.p1 != null ? (axisNow.p2 != null ? '2 / 2' : '1 / 2') : '0 / 2'}.</small>}
            </div>

            {step !== 'info' && (
              <div className="cimp-tools">
                <button type="button" className="icon-btn sm" onClick={() => setZoom((z) => Math.max(1, z / 1.5))} aria-label="Dézoomer"><ZoomOut size={16} /></button>
                <button type="button" className="icon-btn sm" onClick={() => setZoom((z) => Math.min(6, z * 1.5))} aria-label="Zoomer"><ZoomIn size={16} /></button>
                {cur && <label className="cimp-tol">Tolérance <input type="range" min={0} max={1} step={0.05} value={tol} onChange={(e) => setTol(Number(e.target.value))} /></label>}
                {cur && <label className="cimp-man"><input type="checkbox" checked={manual} onChange={(e) => { setManual(e.target.checked); setTr((t) => ({ ...t, [cur]: [] })); }} /> Points à la main</label>}
                <button type="button" className="btn sm" onClick={resetStep}><RotateCcw size={14} aria-hidden /> Recommencer</button>
              </div>
            )}

            {step !== 'info' && (
              <div className="cimp-wrap" ref={wrapRef}>
                <canvas ref={cvRef} onClick={tap} className="cimp-cv" />
              </div>
            )}

            {waitingVal && (
              <div className="cimp-val">
                <div className="cimp-nudge">
                  <button type="button" className="icon-btn sm" onClick={() => nudge(0, -1)} aria-label="Monter"><ArrowUp size={14} /></button>
                  <button type="button" className="icon-btn sm" onClick={() => nudge(0, 1)} aria-label="Descendre"><ArrowDown size={14} /></button>
                  <button type="button" className="icon-btn sm" onClick={() => nudge(-1, 0)} aria-label="Gauche"><ArrowLeft size={14} /></button>
                  <button type="button" className="icon-btn sm" onClick={() => nudge(1, 0)} aria-label="Droite"><ArrowRight size={14} /></button>
                </div>
                <label>Valeur à ce repère <input autoFocus inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmVal()} />
                  <span>{step === 'qx' ? 'm³/h' : step === 'ey' ? '%' : 'm'}</span></label>
                <button type="button" className="btn sm primary" disabled={!Number.isFinite(num(val))} onClick={confirmVal}><Check size={14} aria-hidden /> OK</button>
              </div>
            )}

            {cur && tr[cur].length >= 2 && calOk(qx) && calOk(ys[cur]) && (
              <p className="ihint ok">Courbe lue de {r1(Math.max(0, toVal(qx, tr[cur][0].x)))} à {r1(toVal(qx, tr[cur][tr[cur].length - 1].x))} m³/h
                {cur === 'h' ? ` · ${r1(toVal(ys.h as AxisCal, tr.h[0].y))} m à ${r1(toVal(ys.h as AxisCal, tr.h[tr.h.length - 1].y))} m` : ''}. Si le trait suivi n'est pas le bon, touchez-le à un autre endroit ou changez la tolérance.</p>
            )}

            {step === 'info' && (
              <div className="cimp-info">
                <div className="igrid">
                  <label className="ifld wide"><span>Référence de la pompe (facultatif)</span><input value={info.model} onChange={(e) => setInfo({ ...info, model: e.target.value })} placeholder="ex. CR 10-10" /></label>
                  <label className="ifld"><span>Moteur</span><input inputMode="decimal" value={info.kw} onChange={(e) => setInfo({ ...info, kw: e.target.value })} placeholder="kW" /></label>
                  <label className="ifld"><span>Fréquence de la fiche</span>
                    <select value={info.hz} onChange={(e) => setInfo({ ...info, hz: e.target.value })}><option value="50">50 Hz</option><option value="60">60 Hz</option></select></label>
                </div>
                {hz === 60 && (
                  <label className="cimp-man"><input type="checkbox" checked={info.to50} onChange={(e) => setInfo({ ...info, to50: e.target.checked })} /> Ramener la courbe au réseau 50 Hz (débit × 0,83, hauteur × 0,69) — à cocher si la pompe sera alimentée en 50 Hz</label>
                )}
                <div className="pce-table cimp-tbl" role="table">
                  <div className="pce-row head" role="row"><span>Débit m³/h</span><span>Hauteur m</span><span>Rendement %</span><span>NPSHr m</span><span /></div>
                  {outPts.map((p, n) => <div className="pce-row" role="row" key={n}><span>{p.q.toLocaleString('fr-FR')}</span><span>{p.h.toLocaleString('fr-FR')}</span><span>{p.eta?.toLocaleString('fr-FR') ?? '—'}</span><span>{p.npshr?.toLocaleString('fr-FR') ?? '—'}</span><span /></div>)}
                </div>
                {outPts.length < 3 && <p className="note err">Il faut au moins 3 points : reprenez l'étalonnage ou la courbe H(Q).</p>}
              </div>
            )}

            <div className="cimp-nav">
              {idx > 0 && <button type="button" className="btn sm" onClick={() => go(STEPS[idx - 1].id)}><ArrowLeft size={14} aria-hidden /> Retour</button>}
              {skipOpt && <button type="button" className="btn sm" onClick={() => go(skipOpt as Step)}>Passer</button>}
              {step !== 'info'
                ? <button type="button" className="btn sm primary" disabled={!canNext || ((step === 'ey' || step === 'ny') && !calOk(axisNow)) || ((step === 'e' || step === 'n') && tr[step].length < 2)} onClick={() => go(STEPS[idx + 1].id)}>Suivant <ArrowRight size={14} aria-hidden /></button>
                : <button type="button" className="btn sm primary" disabled={outPts.length < 3} onClick={apply}><Check size={14} aria-hidden /> Utiliser cette courbe</button>}
            </div>
          </>
        )}
      </div>
    </div>, document.body);
}
