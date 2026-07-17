import type { DemoUseCase } from '@/lib/home-content';
import { DemoConversationDrawer } from './DemoConversationDrawer';
import { DemoFrame } from './DemoFrame';
import { DemoTabs } from './DemoTabs';

export function DemoSections({ demos }: { demos: DemoUseCase[] }) {
  return (
    <section
      id="demos"
      data-hash-path="demos"
      aria-labelledby="demos-heading"
      className="section"
      suppressHydrationWarning
    >
      <h2 id="demos-heading">Demos</h2>
      <p className="section-lead">
        Every demo below was built by an agent in conversation with a human. Open the conversation
        under each grid to see the exact prompts and the code the agent produced.
      </p>
      <DemoTabs demos={demos} />
      {demos.map((demo, index) => (
        <article
          key={demo.key}
          id={demo.hashPath}
          data-hash-path={demo.hashPath}
          className={index === 0 ? 'demo-panel demo-panel-default' : 'demo-panel'}
          suppressHydrationWarning
        >
          <h3>{demo.label}</h3>
          <p className="demo-summary">{demo.summary}</p>
          <div className="demo-layout">
            <DemoFrame demo={demo} />
            <DemoConversationDrawer conversation={demo.conversation} />
          </div>
        </article>
      ))}
    </section>
  );
}
