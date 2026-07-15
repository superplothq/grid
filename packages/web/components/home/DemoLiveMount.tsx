'use client';

import { useEffect, useRef } from 'react';
import { demos, createSampleContext } from 'samples';
import 'grid/dist/grid.css';

// Homepage demo panels are all kept in the DOM and only shown/hidden via CSS
// (:target), so a plain mount-on-effect would leave every demo's grid mounted at
// once - heavy with 8-9 live demos. Instead we tie the grid lifecycle to real
// visibility: a hidden panel (display:none) or one scrolled out of view reports as
// not-intersecting, so we mount only the visible demo and tear the previous one down
// when the tab changes.
export function DemoLiveMount({ id }: { id: string }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    let disposed = false;
    let mounted = false;
    let cleanup: (() => void) | undefined;

    const mount = () => {
      if (mounted || disposed) return;
      mounted = true;
      demos[id].load().then((mod) => {
        if (disposed || !mounted) return;
        cleanup = mod.mount(host, createSampleContext());
      });
    };

    const unmount = () => {
      if (!mounted) return;
      mounted = false;
      cleanup?.();
      cleanup = undefined;
      host.replaceChildren();
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) mount();
        else unmount();
      }
    });
    observer.observe(host);

    return () => {
      disposed = true;
      observer.disconnect();
      cleanup?.();
    };
  }, [id]);

  return <div ref={hostRef} />;
}
