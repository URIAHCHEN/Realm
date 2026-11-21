import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './LearningWorkspace.css';

export function LearningWorkspaceHeader({ title, context, description, icon: Icon, children }: {
  title: string;
  context?: string;
  description: string;
  icon: LucideIcon;
  children?: ReactNode;
}) {
  return (
    <header className="learning-hero">
      <div className="learning-hero-copy">
        {context && <p className="learning-hero-context">{context}</p>}
        <div className="learning-hero-heading">
          <span><Icon size={24} aria-hidden="true" /></span>
          <h2>{title}</h2>
        </div>
        <p className="learning-hero-description">{description}</p>
      </div>
      {children}
    </header>
  );
}
