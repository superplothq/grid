'use client';

import { useEffect, useRef } from 'react';
import { samples, createSampleContext } from 'samples';
import 'grid/dist/grid.css';

export function SampleDemo({ id, height = 420 }: { id: string; height?: number }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let cleanup: (() => void) | undefined;
    let disposed = false;

    samples[id].load().then((mod) => {
      if (disposed) return;
      cleanup = mod.mount(host, createSampleContext());
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [id]);

  return (
    <div
      ref={hostRef}
      className="not-prose my-6 overflow-hidden rounded-lg border bg-fd-card"
      style={{ height }}
    />
  );
}
