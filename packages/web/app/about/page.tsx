import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { PlaceholderContent } from '@/components/site/PlaceholderContent';
import { RouteHero } from '@/components/site/RouteHero';
import { aboutPath, contactPath, siteName, siteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'About',
  description: 'About SuperPlot: the team building the agent-first JavaScript grid.',
  alternates: { canonical: `${siteUrl}${aboutPath}` },
};

export default function AboutPage() {
  return (
    <main>
      <JsonLd breadcrumbs={[{ name: 'About', path: aboutPath }]} />
      <RouteHero
        title={`About ${siteName}`}
        lead="We build data-grid infrastructure for the agent era: composable primitives that let humans and coding agents create advanced grids, pivots, and data views together."
      />
      <section className="section">
        <PlaceholderContent>
          <p>
            Full company information — team, story, and mission detail — arrives in a later content
            iteration.
          </p>
        </PlaceholderContent>
        <p className="section-cta">
          <Link className="button button-primary" href={contactPath}>
            Get in touch
          </Link>
        </p>
      </section>
    </main>
  );
}
