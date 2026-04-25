"use client";

import { terms } from "@/lib/terms";
import { Popover, PopoverContent, PopoverTrigger } from "fumadocs-ui/components/ui/popover";
import type { ReactNode } from "react";

export function Term({ id, children }: { id: string; children: ReactNode }) {
  const definition = terms[id];
  if (!definition) return <>{children}</>;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="term"
          data-term={id}
          data-definition={definition}
          className="underline decoration-dotted cursor-help"
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent className="text-sm max-w-xs">
        {definition}
      </PopoverContent>
    </Popover>
  );
}
