import type { Metadata } from 'next';
import { JsonLd } from '@/components/seo/JsonLd';
import { PlaceholderContent } from '@/components/site/PlaceholderContent';
import { RouteHero } from '@/components/site/RouteHero';
import { demoUseCases } from '@/lib/home-content';
import { gridBasePath, gridSamplesPath, siteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Samples',
  description: 'A catalog of SuperPlot grid samples: pivot tables, grouped tables, tree tables, and interaction patterns.',
  alternates: { canonical: `${siteUrl}${gridSamplesPath}` },
};

export default function SamplesPage() {
  return (
    <main>
      <JsonLd
        breadcrumbs={[
          { name: 'Grid', path: gridBasePath },
          { name: 'Samples', path: gridSamplesPath },
        ]}
      />
      <RouteHero
        title="Samples"
        lead="Runnable sample configurations for every grid capability, from minimal flat tables to deep pivot layouts."
      />
      <section className="section">
        <PlaceholderContent>
          <p>
            The sample catalog is being prepared for a later content iteration. It will index
            runnable samples by capability, mirroring the demo use cases below.
          </p>
          <ul>
            {demoUseCases.map((demo) => (
              <li key={demo.key}>
                {demo.label} — {demo.summary}
              </li>
            ))}
          </ul>
        </PlaceholderContent>
      </section>
    </main>
  );
}
