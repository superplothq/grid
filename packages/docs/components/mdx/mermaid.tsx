'use client';

import { use, useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return;
  return <MermaidContent chart={chart} />;
}

const cache = new Map<string, Promise<unknown>>();

function cachePromise<T>(key: string, setPromise: () => Promise<T>): Promise<T> {
  const cached = cache.get(key);
  if (cached) return cached as Promise<T>;

  const promise = setPromise();
  cache.set(key, promise);
  return promise;
}

function MermaidContent({ chart }: { chart: string }) {
  const id = useId();
  const { resolvedTheme } = useTheme();
  const { default: mermaid } = use(cachePromise('mermaid', () => import('mermaid')));

  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'loose',
    fontFamily: 'monospace',
    theme: 'base',
    themeVariables: {
      primaryColor: resolvedTheme === 'dark' ? '#2a2a2a' : '#f5f5f5',
      primaryTextColor: resolvedTheme === 'dark' ? '#e0e0e0' : '#333',
      primaryBorderColor: resolvedTheme === 'dark' ? '#555' : '#ccc',
      lineColor: resolvedTheme === 'dark' ? '#888' : '#666',
      signalColor: resolvedTheme === 'dark' ? '#e0e0e0' : '#333',
      fontSize: '13px',
    },
    sequence: {
      actorMargin: 20,
      boxMargin: 2,
      boxTextMargin: 2,
      noteMargin: 4,
      messageMargin: 20,
      actorFontSize: 13,
      messageFontSize: 12,
      mirrorActors: false,
      useMaxWidth: false,
    },
  });

  const { svg, bindFunctions } = use(
    cachePromise(`${chart}-${resolvedTheme}`, () => {
      return mermaid.render(id, chart.replaceAll('\\n', '\n'));
    }),
  );

  return (
    <div
      ref={(container) => {
        if (container) bindFunctions?.(container);
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
