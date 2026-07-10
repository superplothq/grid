import Link from 'next/link';
import { DiscordIcon, GithubIcon } from '@/components/icons/BrandIcons';
import { gridDemosPath, ourApproachPath } from '@/lib/site-config';

export function Hero({
  copyToAgentPrompt,
  githubUrl,
  discordUrl,
}: {
  copyToAgentPrompt: string;
  githubUrl: string;
  discordUrl: string;
}) {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <div className="hero-claim">
        <h1 id="hero-heading">The JavaScript grid built for agents</h1>
        <p className="hero-lead">
          Create advanced grids, pivots, and data views using prompts, typed APIs, and composable
          primitives — without manually stitching frontend, backend, and query logic by hand. Build
          on a composable architecture designed for coding agents.
        </p>
        <div className="hero-ctas">
          <Link className="button button-primary" href={gridDemosPath}>
            View demos
          </Link>
          <Link className="button button-secondary" href={ourApproachPath}>
            Read about our approach
          </Link>
        </div>
      </div>
      <div className="hero-bridge">
        <div className="bridge-panel">
          <div className="bridge-panel-header">
            <p className="bridge-panel-title">Copy to your agent</p>
            <button
              type="button"
              className="button button-ghost"
              data-copy-target="agent-prompt"
            >
              Copy prompt
            </button>
          </div>
          <pre id="agent-prompt" className="bridge-prompt" tabIndex={0}>
            <code>{copyToAgentPrompt}</code>
          </pre>
          <div className="hero-ctas">
            <a className="button button-secondary" href={githubUrl}>
              <GithubIcon className="button-icon" />
              GitHub
            </a>
            <a className="button button-secondary" href={discordUrl}>
              <DiscordIcon className="button-icon" />
              Join our Discord
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
