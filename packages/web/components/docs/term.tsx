import type { ReactNode } from "react";

// Simplified passthrough: the standalone docs site backed <Term> with a glossary
// popover; web renders the term text inline without the popover.
export function Term({ children }: { id: string; children: ReactNode }) {
  return <>{children}</>;
}
