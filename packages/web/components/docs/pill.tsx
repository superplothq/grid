import type { ReactNode } from 'react';

// A Tableau-style field pill: dimensions blue, measures green.
export function Pill({ kind, children }: { kind: 'dimension' | 'measure'; children: ReactNode }) {
  return <span className={`doc-pill doc-pill-${kind}`}>{children}</span>;
}
