import { ensureElec } from './installer/electrical';
import type { Installation } from './installer/types';

/** Projets enregistrés sur l'appareil (localStorage). Chaque projet est une installation complète. */
export interface ProjectMeta { id: string; name: string; app: string; created: number; updated: number }

const INDEX = 'ecopump-projects-v1';
const DATA = (id: string) => `ecopump-proj-${id}`;
const OLD = 'ecopump-installer-v1';

const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

interface Index { list: ProjectMeta[]; current: string | null }

function readIndex(): Index {
  try {
    const raw = localStorage.getItem(INDEX);
    if (raw) { const x = JSON.parse(raw) as Index; if (Array.isArray(x.list)) return x; }
  } catch { /* ignore */ }
  return { list: [], current: null };
}
function writeIndex(x: Index) { try { localStorage.setItem(INDEX, JSON.stringify(x)); } catch { /* plein */ } }

/** Reprend l'installation de l'ancienne version (un seul projet) comme premier projet. */
function migrate(): Index {
  const idx = readIndex();
  if (idx.list.length) return idx;
  try {
    const raw = localStorage.getItem(OLD);
    if (raw) {
      const inst = ensureElec(JSON.parse(raw) as Installation);
      const id = newId();
      localStorage.setItem(DATA(id), JSON.stringify(inst));
      const now = Date.now();
      const out = { list: [{ id, name: inst.name, app: inst.app, created: now, updated: now }], current: id };
      writeIndex(out);
      return out;
    }
  } catch { /* ignore */ }
  return idx;
}

export function listProjects(): ProjectMeta[] { return migrate().list.slice().sort((a, b) => b.updated - a.updated); }
export function currentId(): string | null { return migrate().current; }

export function loadProject(id: string): Installation | null {
  try { const raw = localStorage.getItem(DATA(id)); return raw ? ensureElec(JSON.parse(raw) as Installation) : null; } catch { return null; }
}

/** Enregistre (crée si besoin) et rend ce projet courant. Renvoie false si la mémoire est pleine. */
export function saveProject(id: string, inst: Installation): boolean {
  const idx = readIndex();
  const now = Date.now();
  try { localStorage.setItem(DATA(id), JSON.stringify(inst)); } catch { return false; }
  const m = idx.list.find((p) => p.id === id);
  if (m) { m.name = inst.name; m.app = inst.app; m.updated = now; } else idx.list.push({ id, name: inst.name, app: inst.app, created: now, updated: now });
  idx.current = id;
  writeIndex(idx);
  return true;
}

export function createProject(inst: Installation): string {
  const id = newId();
  saveProject(id, inst);
  return id;
}

export function setCurrent(id: string) { const idx = readIndex(); idx.current = id; writeIndex(idx); }

export function deleteProject(id: string) {
  const idx = readIndex();
  idx.list = idx.list.filter((p) => p.id !== id);
  if (idx.current === id) idx.current = idx.list.sort((a, b) => b.updated - a.updated)[0]?.id ?? null;
  writeIndex(idx);
  try { localStorage.removeItem(DATA(id)); } catch { /* ignore */ }
}

export function duplicateProject(id: string): string | null {
  const inst = loadProject(id);
  if (!inst) return null;
  return createProject({ ...inst, name: `${inst.name} (copie)` });
}

/* ---------- Fichier et lien de partage ---------- */
const FORMAT = 'ecopump-projet';

export function toFile(inst: Installation): Blob {
  return new Blob([JSON.stringify({ format: FORMAT, version: 1, saved: new Date().toISOString(), installation: inst }, null, 1)], { type: 'application/json' });
}

/** Lit un fichier de projet (ou un JSON d'installation brut) et vérifie l'essentiel. */
export function fromJson(text: string): Installation {
  const j = JSON.parse(text) as { format?: string; installation?: Installation } & Partial<Installation>;
  const inst = (j.format === FORMAT ? j.installation : j) as Installation | undefined;
  if (!inst || typeof inst !== 'object' || !inst.app || !inst.pump || !inst.geo || !inst.duty || !inst.asp || !inst.ref) throw new Error('Ce fichier n\'est pas un projet ECO PUMP AFRIK.');
  return ensureElec({ ...inst, acc: inst.acc ?? {} });
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

/** Lien qui contient tout le projet (compressé), à envoyer par WhatsApp ou e-mail. */
export async function shareLink(inst: Installation): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(inst));
  let tag = 'j', data = raw;
  if (typeof CompressionStream !== 'undefined') { data = await pipe(raw, new CompressionStream('deflate-raw')); tag = 'z'; }
  return `${location.origin}/#projet=${tag}${b64url(data)}`;
}

export async function fromLink(hash: string): Promise<Installation | null> {
  const m = /#projet=([jz])([A-Za-z0-9_-]+)/.exec(hash);
  if (!m) return null;
  let bytes = unb64url(m[2]);
  if (m[1] === 'z') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
  return fromJson(new TextDecoder().decode(bytes));
}
