"use client";

import { TypeTable as FumadocsTypeTable } from "fumadocs-ui/components/type-table";
import { useEffect, useRef, type ComponentProps } from "react";

export function TypeTable(props: ComponentProps<typeof FumadocsTypeTable>) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll<HTMLButtonElement>("button[data-state='closed']").forEach((btn) => btn.click());
  }, []);

  return (
    <div ref={ref}>
      <FumadocsTypeTable {...props} />
    </div>
  );
}
