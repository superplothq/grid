import type { DemoUseCase } from '@/lib/home-content';

export function DemoFrame({ demo }: { demo: DemoUseCase }) {
  return (
    <div className="demo-frame">
      <div id={demo.gridMountId} data-grid-demo={demo.key} className="demo-frame-mount">
        <p className="demo-frame-fallback">
          The live {demo.label} grid demo will render here. Demos are added progressively — the
          conversation below shows how an agent builds this grid.
        </p>
      </div>
    </div>
  );
}
