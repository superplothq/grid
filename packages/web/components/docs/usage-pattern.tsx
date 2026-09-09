import type { ReactNode } from 'react';

export function UsagePattern({ intent, children }: { intent: string; children: ReactNode }) {
  return (
    <div className="doc-usage-pattern">
      <div className="doc-usage-pattern-header">
        <svg
          className="doc-usage-pattern-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-6" />
          <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
          <path d="M8 21H3v-5" />
        </svg>
        <span className="doc-usage-pattern-title">Usage pattern</span>
        <span className="doc-usage-pattern-intent">{intent}</span>
      </div>
      {children}
    </div>
  );
}
