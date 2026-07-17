'use client';

import { useEffect, useRef } from 'react';
import { demos, createSampleContext } from 'samples';
import 'grid/dist/grid.css';

// Mirrors components/docs/sample-demo.tsx: dynamic-import the demo module and run
// its mount in an effect, with strict-mode-safe cleanup. Demos are self-contained
// so the context is passed only to satisfy the shared mount signature.
export function DemoHost({ id }: { id: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let cleanup: (() => void) | undefined;
    let disposed = false;

    demos[id].load().then((mod) => {
      if (disposed) return;
      cleanup = mod.mount(host, createSampleContext());
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [id]);

  return <div ref={hostRef} />;
}
