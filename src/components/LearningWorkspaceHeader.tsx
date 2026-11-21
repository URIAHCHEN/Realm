import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import './LearningWorkspace.css';

interface WorkspaceHeadingProps {
  title: string;
  context?: string;
  description: string;
  icon: LucideIcon;
}

export function LearningWorkspaceHeading({ title, context, description, icon: Icon }: WorkspaceHeadingProps) {
  return (
    <div className="learning-workspace-heading">
      <span className="learning-workspace-mark"><Icon size={20} aria-hidden="true" /></span>
      <div className="learning-workspace-copy">
        {context && <p className="learning-workspace-context">{context}</p>}
        <h2>{title}</h2>
        <p className="learning-workspace-description">{description}</p>
      </div>
    </div>
  );
}

export function LearningWorkspaceHeader({ children, ...heading }: WorkspaceHeadingProps & { children?: ReactNode }) {
  return (
    <header className="learning-workspace-header ios-glass-card">
      <LearningWorkspaceHeading {...heading} />
      {children}
    </header>
  );
}
