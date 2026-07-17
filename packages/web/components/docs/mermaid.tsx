'use client';

import { Suspense, use, useId, useSyncExternalStore } from 'react';

// True only after hydration on the client. MermaidContent dynamic-imports mermaid and
// suspends, so it must not run during the static prerender.
function useIsClient(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

// web docs theme via `html[data-theme]` (no next-themes). Fall back to the OS scheme
// when it is unset, matching how the grid samples resolve their theme.
function resolveTheme(): 'light' | 'dark' {
  const attr = document.documentElement.dataset.theme;
  if (attr === 'dark' || attr === 'light') return attr;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function useDocTheme(): 'light' | 'dark' {
  return useSyncExternalStore(
    (onChange) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      const media = matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', onChange);
      return () => {
        observer.disconnect();
        media.removeEventListener('change', onChange);
      };
    },
    resolveTheme,
    () => 'light',
  );
}

export function Mermaid({ chart }: { chart: string }) {
  if (!useIsClient()) return null;
  return (
    <Suspense fallback={null}>
      <MermaidContent chart={chart} />
    </Suspense>
  );
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
  const resolvedTheme = useDocTheme();
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
      return mermaid.render(id.replace(/[^a-zA-Z0-9]/g, ''), chart.replaceAll('\\n', '\n'));
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
