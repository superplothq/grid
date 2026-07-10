import type { DemoUseCase } from '@/lib/home-content';

export function DemoTabs({ demos }: { demos: DemoUseCase[] }) {
  return (
    <nav aria-label="Demo use cases" className="demo-tabs">
      {demos.map((demo) => (
        <a
          key={demo.key}
          href={`#${demo.hashPath}`}
          data-hash-link={demo.hashPath}
          title={`See ${demo.label} with ${demo.theme}`}
          suppressHydrationWarning
        >
          {demo.label}
        </a>
      ))}
    </nav>
  );
}
