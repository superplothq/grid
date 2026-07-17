'use client';

import { useEffect, useRef } from 'react';
import { loadPivotPlayground } from 'samples';
import 'grid/dist/grid.css';

export function PivotDemo({ rows, columns }: { rows: string; columns: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let cleanup: (() => void) | undefined;
    let disposed = false;

    loadPivotPlayground().then(({ mountPivot }) => {
      if (disposed) return;
      cleanup = mountPivot(host, { rows, columns });
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [rows, columns]);

  return <div ref={hostRef} className="not-prose my-6" />;
}
