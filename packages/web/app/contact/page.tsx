import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { RouteHero } from '@/components/site/RouteHero';
import {
  contactEmail,
  contactPath,
  discordUrl,
  githubUrl,
  siteName,
  siteUrl,
  twitterUrl,
} from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contact the SuperPlot team by email, GitHub, Discord, or Twitter/X.',
  alternates: { canonical: `${siteUrl}${contactPath}` },
};

export default function ContactPage() {
  return (
    <main>
      <JsonLd breadcrumbs={[{ name: 'Contact', path: contactPath }]} />
      <RouteHero
        title="Contact"
        lead={`Questions about ${siteName}, the grid, or working with us? Reach out through any channel below.`}
      />
      <section className="section">
        <ul className="link-list">
          <li>
            Email: <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          </li>
          <li>
            GitHub: <a href={githubUrl}>{githubUrl}</a>
          </li>
          <li>
            Discord: <a href={discordUrl}>Join our Discord (invite coming soon)</a>
          </li>
          <li>
            Twitter / X: <a href={twitterUrl}>Profile coming soon</a>
          </li>
        </ul>
      </section>
    </main>
  );
}
