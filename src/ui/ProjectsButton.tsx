import { FolderOpen } from 'lucide-react';

export function ProjectsButton({ onClick }: { onClick: () => void }) {
  return <button className="icon-btn" onClick={onClick} aria-label="Mes projets" title="Mes projets"><FolderOpen size={18} /></button>;
}
