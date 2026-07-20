import type { Metadata } from 'next';
import { DiscordIcon, GithubIcon } from '@/components/icons/BrandIcons';
import { JsonLd } from '@/components/seo/JsonLd';
import { RouteHero } from '@/components/site/RouteHero';
import { contactEmail, contactPath, discordUrl, githubUrl, siteName, siteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Contact',
  description:
    'Contact the SuperPlot team: support, feature requests, commercial queries, contributing, and community.',
  alternates: { canonical: `${siteUrl}${contactPath}` },
};

const supportChannelUrl = 'https://discord.gg/XNaDvDdEy';

export default function ContactPage() {
  return (
    <main className="approach-main">
      <JsonLd breadcrumbs={[{ name: 'Contact', path: contactPath }]} />
      <RouteHero
        title="Contact"
        lead={`Questions about ${siteName}, the grid, or working with us? Reach out through any channel below.`}
      />

      <section className="section approach-section">
        <h2>For support related issues or reporting a bug</h2>
        <p className="section-lead">
          Please post in the{' '}
          <a href={supportChannelUrl} target="_blank" rel="noopener noreferrer">
            #support
          </a>{' '}
          channel in our Discord.
        </p>
        <a
          className="doc-link-card"
          href={supportChannelUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="doc-link-card-head">
            <DiscordIcon className="doc-link-card-icon" />
            <span className="doc-link-card-title">#support</span>
          </span>
          <span className="doc-link-card-text">
            Report bugs and get help with anything blocking you. The team and community keep an eye
            on this channel.
          </span>
        </a>
      </section>

      <section className="section approach-section">
        <h2>For feature requests and feedback</h2>
        <p className="section-lead">
          We would love to get your feedback or new ideas - please post them in our Discord.
          Alternatively, you can also email us at{' '}
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
        <a
          className="doc-link-card"
          href={supportChannelUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="doc-link-card-head">
            <DiscordIcon className="doc-link-card-icon" />
            <span className="doc-link-card-title">#support</span>
          </span>
          <span className="doc-link-card-text">
            Share feature requests, ideas, and product feedback. Tell us what would make the grid
            better for you.
          </span>
        </a>
      </section>

      <section className="section approach-section">
        <h2>For any commercial queries or collaboration requests</h2>
        <p className="section-lead">
          Please reach out to us directly at <a href={`mailto:${contactEmail}`}>{contactEmail}</a>.
        </p>
      </section>

      <section className="section approach-section">
        <h2>For questions around contributing code</h2>
        <p className="section-lead">Please see the Contributions guide in our GitHub repo.</p>
        <a className="doc-link-card" href={githubUrl} target="_blank" rel="noopener noreferrer">
          <span className="doc-link-card-head">
            <GithubIcon className="doc-link-card-icon" />
            <span className="doc-link-card-title">superplothq/grid</span>
          </span>
          <span className="doc-link-card-text">The JavaScript grid built for agents.</span>
        </a>
      </section>

      <section className="section approach-section">
        <h2>Join our community</h2>
        <p className="section-lead">
          Join our Discord community at{' '}
          <a href={discordUrl} target="_blank" rel="noopener noreferrer">
            {discordUrl.replace('https://', '')}
          </a>
          .
        </p>
        <a className="doc-link-card" href={discordUrl} target="_blank" rel="noopener noreferrer">
          <span className="doc-link-card-head">
            <DiscordIcon className="doc-link-card-icon" />
            <span className="doc-link-card-title">#general</span>
          </span>
          <span className="doc-link-card-text">
            Hang out with the community, share what you are building, and stay up to date on what is
            coming next.
          </span>
        </a>
      </section>
    </main>
  );
}
