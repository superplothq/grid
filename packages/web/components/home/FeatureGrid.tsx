import Link from 'next/link';
import {
  Accessibility,
  BarChart3,
  Bot,
  Filter,
  Gauge,
  ListTree,
  Palette,
  Server,
  Table,
} from 'lucide-react';
import type { FeatureLink } from '@/lib/home-content';

const icons: Record<FeatureLink['icon'], typeof Gauge> = {
  bot: Bot,
  server: Server,
  table: Table,
  tree: ListTree,
  gauge: Gauge,
  chart: BarChart3,
  filter: Filter,
  accessibility: Accessibility,
  palette: Palette,
};

export function FeatureGrid({ features }: { features: FeatureLink[] }) {
  return (
    <div className="card-grid card-grid-3">
      {features.map((feature) => {
        const Icon = icons[feature.icon];
        return (
          <article
            key={feature.hashPath}
            data-hash-path={feature.hashPath}
            className="card"
            suppressHydrationWarning
          >
            <Icon className="card-icon" aria-hidden="true" />
            <h3>{feature.title}</h3>
            <p>{feature.body}</p>
            {/* Hash links drive the CSS :target demo panels, which only update on
                native fragment navigation - a Next.js Link uses pushState and would
                change the URL without moving the page, so use a plain anchor. */}
            {feature.href.includes('#') ? (
              <a href={feature.href}>Explore</a>
            ) : (
              <Link href={feature.href}>Explore</Link>
            )}
          </article>
        );
      })}
    </div>
  );
}
