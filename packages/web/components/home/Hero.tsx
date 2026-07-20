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
            <p className="bridge-panel-title">
              <span className="bridge-panel-title-text">Install via your agent</span>
            </p>
            <button
              type="button"
              className="button bridge-copy-button"
              data-copy-target="agent-prompt"
            >
              Copy prompt
            </button>
          </div>
          <ol className="bridge-steps">
            <li>
              Paste this following line in your agent:{' '}
              <span id="agent-prompt" className="bridge-highlight bridge-highlight-block">
                {copyToAgentPrompt}
              </span>
            </li>
            <li>
              Converse with your agent to create a grid for yourself. Here is a start up prompt{' '}
              <button
                type="button"
                className="copy-icon-button"
                data-copy-icon=""
                data-copy-target="grid-prompt"
                aria-label="Copy prompt"
              >
                <svg
                  className="copy-icon-copy"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M16 1H4a2 2 0 0 0-2 2v12h2V3h12V1zm3 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z" />
                </svg>
                <svg
                  className="copy-icon-check"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </button>
              <span id="grid-prompt" className="bridge-highlight bridge-highlight-block">
                Make me a grid to surprise me.
              </span>
            </li>
          </ol>
          <div className="hero-ctas">
            <a className="button button-secondary" href={githubUrl}>
              <GithubIcon className="button-icon" />
              MIT Licensed on GitHub
            </a>
            <a className="button button-secondary" href={discordUrl}>
              <DiscordIcon className="button-icon" />
              Join our Discord
            </a>
          </div>
        </div>
        <p className="bridge-footnote">
          <code className="bridge-highlight">/superplot help</code> to see available skills
        </p>
      </div>
    </section>
  );
}
