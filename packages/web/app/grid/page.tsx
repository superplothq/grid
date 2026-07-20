import type { Metadata } from 'next';
import { AgentStackBar } from '@/components/home/AgentStackBar';
import { ComparisonScaffold } from '@/components/home/ComparisonScaffold';
import { DemoSections } from '@/components/home/DemoSections';
import { FaqSection } from '@/components/home/FaqSection';
import { FeatureGrid } from '@/components/home/FeatureGrid';
import { GetStartedSection } from '@/components/home/GetStartedSection';
import { Hero } from '@/components/home/Hero';
import { PrinciplesSection } from '@/components/home/PrinciplesSection';
import { JsonLd } from '@/components/seo/JsonLd';
import {
  agentItems,
  copyToAgentPrompt,
  demoUseCases,
  faqItems,
  features,
  principles,
  stackItems,
} from '@/lib/home-content';
import { discordUrl, githubUrl, gridBasePath, gridDocsPath, siteName, siteUrl } from '@/lib/site-config';

export const metadata: Metadata = {
  title: `${siteName} - JavaScript grid built for agents`,
  description:
    'Create advanced grids, pivots, and data views using prompts, typed APIs, and composable primitives.',
  alternates: { canonical: `${siteUrl}${gridBasePath}` },
};

export default function GridPage() {
  return (
    <main>
      <JsonLd faqItems={faqItems} breadcrumbs={[{ name: 'Grid', path: gridBasePath }]} />
      <div className="first-viewport">
        <Hero copyToAgentPrompt={copyToAgentPrompt} githubUrl={githubUrl} discordUrl={discordUrl} />
        <AgentStackBar agents={agentItems} stacks={stackItems} />
      </div>
      <DemoSections demos={demoUseCases} />
      <PrinciplesSection principles={principles} />
      <section id="features" aria-labelledby="features-heading" className="section">
        <h2 id="features-heading">Core features and capabilities</h2>
        <FeatureGrid features={features} />
      </section>
      <ComparisonScaffold />
      <FaqSection items={faqItems} />
      <GetStartedSection
        agents={agentItems}
        agentPrompt={copyToAgentPrompt}
        primaryHref={gridDocsPath}
      />
    </main>
  );
}
