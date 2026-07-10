import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/seo/JsonLd';
import { PlaceholderContent } from '@/components/site/PlaceholderContent';
import { RouteHero } from '@/components/site/RouteHero';
import { features } from '@/lib/home-content';
import { gridBasePath, gridDocsPath, siteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Docs',
  description: 'SuperPlot grid documentation: data pipeline concepts, table algebra, framework bindings, and feature guides.',
  alternates: { canonical: `${siteUrl}${gridDocsPath}` },
};

export default function DocsPage() {
  return (
    <main>
      <JsonLd
        breadcrumbs={[
          { name: 'Grid', path: gridBasePath },
          { name: 'Docs', path: gridDocsPath },
        ]}
      />
      <RouteHero
        title="Grid documentation"
        lead="Concepts, guides, and API references for the SuperPlot grid: the DataSource to Renderer pipeline, table algebra, and framework bindings."
      />
      <section className="section">
        <PlaceholderContent>
          <p>
            Full documentation lands in a later iteration. Feature guides are indexed below in the
            meantime.
          </p>
        </PlaceholderContent>
        <h2>Feature guides</h2>
        <ul className="link-list">
          {features.map((feature) => (
            <li key={feature.hashPath}>
              <Link href={feature.href}>{feature.title}</Link> — {feature.body}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
