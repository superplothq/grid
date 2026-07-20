import Link from 'next/link';
import type { StackBarItem } from '@/lib/home-content';

const gridExamplePrompt =
  'Create a standard grid to show all the data, i should be able to sort the columns and filter by string.';

function LogoTrack({ agents, hidden }: { agents: StackBarItem[]; hidden?: boolean }) {
  return (
    <ul className="marquee-track marquee-track-logos" aria-hidden={hidden || undefined}>
      {agents.map((agent) => (
        <li key={agent.name} title={agent.name}>
          <span className="stack-logo stack-logo-zoom">
            <img src={agent.icon} alt={agent.name} width={20} height={20} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export function GetStartedSection({
  agents,
  agentPrompt,
  primaryHref,
}: {
  agents: StackBarItem[];
  agentPrompt: string;
  primaryHref: string;
}) {
  return (
    <section id="get-started" aria-labelledby="get-started-heading" className="section">
      <h2 id="get-started-heading">Get started</h2>
      <ol className="get-started-steps">
        <li>
          <h3>Open your preferred coding agent</h3>
          <p>
            SuperPlot is agent-agnostic - use whichever coding agent you already work in. The setup
            instructions read the same to all of them.
          </p>
          <div className="get-started-agents marquee" data-marquee="always">
            <LogoTrack agents={agents} />
            <LogoTrack agents={agents} hidden />
          </div>
        </li>
        <li>
          <h3>Paste the following prompt</h3>
          <p>
            Our setup skill will guide your agent to set up SuperPlot for you. Copy the following
            prompt and paste it in your agent.
          </p>
          <div className="code-copy">
            <button
              type="button"
              className="code-copy-button"
              data-copy-target="get-started-prompt"
            >
              Copy
            </button>
            <pre>
              <code id="get-started-prompt">{agentPrompt}</code>
            </pre>
          </div>
        </li>
        <li>
          <h3>Converse with your agent to create a grid</h3>
          <p>
            Our skill prompts your agent to ask you the right questions before it starts building,
            so don&rsquo;t worry if you don&rsquo;t have everything up front. Here is an example to
            start from.
          </p>
          <div className="code-copy">
            <button
              type="button"
              className="code-copy-button"
              data-copy-target="get-started-example"
            >
              Copy
            </button>
            <pre>
              <code id="get-started-example">{gridExamplePrompt}</code>
            </pre>
          </div>
        </li>
      </ol>
      <p className="section-cta">
        <Link className="button button-primary" href={primaryHref}>
          Read the docs
        </Link>
      </p>
    </section>
  );
}
