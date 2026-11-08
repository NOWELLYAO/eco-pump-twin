import { useRef, useState } from 'react';
import { Copy, FileDown, FileUp, FolderOpen, Link2, Plus, Trash2, X } from 'lucide-react';
import { APPS } from '../installer/catalog';
import { evaluate } from '../installer/evaluate';
import type { AppId, Installation } from '../installer/types';
import { deleteProject, duplicateProject, fromJson, listProjects, loadProject, shareLink, toFile } from '../projects';
import { shareOrDownload } from './pdf';

const when = (t: number) => new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
const safe = (s: string) => s.normalize('NFD').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'projet';

export function ProjectsModal({ currentId, inst, onOpen, onNew, onImport, onClose }: {
  currentId: string | null; inst: Installation;
  onOpen: (id: string) => void; onNew: () => void; onImport: (i: Installation) => void; onClose: () => void;
}) {
  const [ver, setVer] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const list = listProjects();
  void ver;
  const scoreOf = (id: string) => { const x = id === currentId ? inst : loadProject(id); try { return x ? evaluate(x).score : null; } catch { return null; } };
  const flash = (m: string) => { setMsg(m); window.setTimeout(() => setMsg(null), 3500); };

  const exportFile = async () => {
    const r = await shareOrDownload(toFile(inst), `${safe(inst.name)}.ecopump.json`, inst.name);
    if (r === 'downloaded') flash('Fichier du projet téléchargé.');
  };
  const share = async () => {
    try {
      const url = await shareLink(inst);
      if (navigator.share) { try { await navigator.share({ title: inst.name, text: `Projet de pompage « ${inst.name} »`, url }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; } }
      await navigator.clipboard.writeText(url);
      flash('Lien copié : collez-le dans WhatsApp ou un e-mail.');
    } catch { flash('Impossible de créer le lien sur cet appareil : utilisez « Exporter le fichier ».'); }
  };
  const importFile = async (f: File) => {
    try { onImport(fromJson(await f.text())); } catch (e) { flash((e as Error).message || 'Fichier illisible.'); }
  };

  return (
    <div className="backdrop" onClick={onClose}>
      <div className="modal wide projects" role="dialog" aria-modal aria-label="Mes projets" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2>Mes projets</h2><button className="icon-btn" onClick={onClose} aria-label="Fermer"><X size={20} /></button></div>
        <p className="muted small">Les projets sont enregistrés automatiquement sur cet appareil, même hors ligne. Pour les garder en sécurité ou les transmettre, exportez-les en fichier ou partagez un lien.</p>
        <div className="proj-actions">
          <button className="btn primary" onClick={onNew}><Plus size={16} aria-hidden /> Nouveau projet</button>
          <button className="btn" onClick={() => fileRef.current?.click()}><FileUp size={16} aria-hidden /> Importer un fichier</button>
          <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
        </div>
        <h3 className="proj-h">Projet ouvert : {inst.name}</h3>
        <div className="proj-actions">
          <button className="btn" onClick={() => void exportFile()}><FileDown size={16} aria-hidden /> Exporter le fichier</button>
          <button className="btn" onClick={() => void share()}><Link2 size={16} aria-hidden /> Partager un lien</button>
        </div>
        {msg && <p className="proj-msg">{msg}</p>}
        <h3 className="proj-h">Tous les projets ({list.length})</h3>
        <ul className="proj-list">
          {list.map((p) => {
            const sc = scoreOf(p.id);
            const cur = p.id === currentId;
            return (
              <li key={p.id} className={cur ? 'cur' : ''}>
                <button className="proj-open" onClick={() => onOpen(p.id)} disabled={cur}>
                  <b>{p.name || 'Sans nom'}</b>
                  <small>{APPS[p.app as AppId]?.label ?? p.app} · modifié le {when(p.updated)}{cur ? ' · ouvert' : ''}</small>
                </button>
                {sc != null && <span className={`proj-score ${sc >= 75 ? 'ok' : sc >= 50 ? 'warn' : 'bad'}`}>{sc}</span>}
                <button className="icon-btn" title="Dupliquer" aria-label={`Dupliquer ${p.name}`} onClick={() => { duplicateProject(p.id); setVer((v) => v + 1); flash('Copie créée.'); }}><Copy size={16} /></button>
                {confirm === p.id
                  ? <button className="btn sm danger" onClick={() => { deleteProject(p.id); setConfirm(null); setVer((v) => v + 1); if (cur) onOpen(listProjects()[0]?.id ?? ''); }}>Confirmer</button>
                  : <button className="icon-btn" title="Supprimer" aria-label={`Supprimer ${p.name}`} onClick={() => setConfirm(p.id)} disabled={list.length <= 1}><Trash2 size={16} /></button>}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export function ProjectsButton({ onClick }: { onClick: () => void }) {
  return <button className="icon-btn" onClick={onClick} aria-label="Mes projets" title="Mes projets"><FolderOpen size={18} /></button>;
}
