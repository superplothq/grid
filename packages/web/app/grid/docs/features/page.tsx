import type { Metadata } from 'next';
import { FeatureGrid } from '@/components/home/FeatureGrid';
import { JsonLd } from '@/components/seo/JsonLd';
import { PlaceholderContent } from '@/components/site/PlaceholderContent';
import { RouteHero } from '@/components/site/RouteHero';
import { features } from '@/lib/home-content';
import { gridBasePath, gridDocsPath, gridFeaturesPath, siteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Features',
  description: 'All SuperPlot grid features: virtualized rendering, grouping, tree tables, pivot tables, SQL code generation, filtering, real-time updates, interactions, and theming.',
  alternates: { canonical: `${siteUrl}${gridFeaturesPath}` },
};

export default function FeaturesPage() {
  return (
    <main>
      <JsonLd
        breadcrumbs={[
          { name: 'Grid', path: gridBasePath },
          { name: 'Docs', path: gridDocsPath },
          { name: 'Features', path: gridFeaturesPath },
        ]}
      />
      <RouteHero
        title="Grid features"
        lead="Every capability of the SuperPlot grid, each backed by the same composable data pipeline."
      />
      <section className="section">
        <FeatureGrid features={features} />
      </section>
      <section className="section" aria-label="Feature details">
        {features.map((feature) => (
          <article
            key={feature.hashPath}
            id={feature.hashPath}
            data-hash-path={feature.hashPath}
            className="feature-detail"
            suppressHydrationWarning
          >
            <h2>{feature.title}</h2>
            <p>{feature.body}</p>
            <PlaceholderContent>
              <p>
                The full guide for this feature, with runnable samples, arrives in a later content
                iteration.
              </p>
            </PlaceholderContent>
          </article>
        ))}
      </section>
    </main>
  );
}
