/**
 * Rapport PDF : on photographie chaque bloc du rapport (en thème clair) et on
 * les répartit sur des pages A4. Bibliothèques chargées à la demande.
 */
export async function buildReportPdf(container: HTMLElement, title: string): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([import('jspdf'), import('html2canvas-pro')]);
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const W = 210, H = 297, M = 10, HEAD = 16, FOOT = 10;
  const usableW = W - 2 * M;
  const date = new Date().toLocaleDateString('fr-FR');
  let logo: HTMLImageElement | null = null;
  try {
    logo = await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = '/logo.png'; });
  } catch { logo = null; }

  const header = () => {
    if (logo) pdf.addImage(logo, 'PNG', M, 4, 16, 10.3);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(11); pdf.setTextColor(13, 102, 153);
    pdf.text('ECO PUMP AFRIK', M + 19, 8.5);
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90, 107, 120);
    pdf.text(`${title} — ${date}`, M + 19, 13);
    pdf.setDrawColor(215, 224, 232); pdf.line(M, HEAD - 1, W - M, HEAD - 1);
  };
  header();
  const maxPage = H - HEAD - FOOT - 4; // mm utiles par page
  const cRect = container.getBoundingClientRect();
  const pxToMm = usableW / Math.max(1, cRect.width);
  const capPx = maxPage / pxToMm; // hauteur utile d'une page, en px écran
  // Points de coupure possibles : bas de chaque bloc « feuille » (alerte, ligne de tableau, carte…)
  const leaves = (el: HTMLElement): HTMLElement[] => {
    if (el.offsetHeight * pxToMm <= maxPage * 0.45) return [el];
    const kids = (Array.from(el.children) as HTMLElement[]).filter((k) => k.offsetHeight > 0);
    return kids.length ? kids.flatMap(leaves) : [el];
  };
  const cuts = new Set<number>();
  for (const top of Array.from(container.children) as HTMLElement[]) {
    if (!top.offsetHeight) continue;
    for (const l of leaves(top)) cuts.add(Math.round(l.getBoundingClientRect().bottom - cRect.top));
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const total = Math.ceil(container.scrollHeight);
  // Une seule capture de tout le rapport
  const scale = 2;
  const canvas = await html2canvas(container, { scale, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: Math.ceil(cRect.width) });
  let y0 = 0;
  let first = true;
  while (y0 < total - 2) {
    if (!first) { pdf.addPage(); header(); }
    first = false;
    const limit = y0 + capPx;
    let y1 = sorted.filter((c) => c > y0 + 40 && c <= limit).pop() ?? Math.min(limit, total);
    if (y1 <= y0) y1 = Math.min(limit, total);
    const sy = Math.round(y0 * scale), sh = Math.max(1, Math.round((y1 - y0) * scale));
    const part = document.createElement('canvas');
    part.width = canvas.width; part.height = Math.min(sh, canvas.height - sy);
    part.getContext('2d')!.drawImage(canvas, 0, sy, canvas.width, part.height, 0, 0, canvas.width, part.height);
    pdf.addImage(part.toDataURL('image/jpeg', 0.88), 'JPEG', M, HEAD + 2, usableW, (part.height / scale) * pxToMm);
    y0 = y1 + 1;
  }
  const n = pdf.getNumberOfPages();
  for (let p = 1; p <= n; p++) {
    pdf.setPage(p); pdf.setFontSize(8); pdf.setTextColor(140, 150, 160);
    pdf.text(`Page ${p} / ${n} · Rapport généré par le configurateur ECO PUMP AFRIK`, W / 2, H - 4, { align: 'center' });
  }
  return pdf.output('blob');
}

/** Partage (menu du téléphone) ou téléchargement du PDF. */
export async function shareOrDownload(blob: Blob, filename: string, title: string) {
  const file = new File([blob], filename, { type: blob.type || 'application/pdf' });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title }); return 'shared'; } catch (e) { if ((e as Error).name === 'AbortError') return 'cancel'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
  return 'downloaded';
}
