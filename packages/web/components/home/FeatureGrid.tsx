import Link from 'next/link';
import {
  Filter,
  Gauge,
  Layers,
  ListTree,
  Move,
  Palette,
  Radio,
  Server,
  Table,
} from 'lucide-react';
import type { FeatureLink } from '@/lib/home-content';

const icons: Record<FeatureLink['icon'], typeof Gauge> = {
  gauge: Gauge,
  layers: Layers,
  tree: ListTree,
  table: Table,
  server: Server,
  filter: Filter,
  radio: Radio,
  move: Move,
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
            <Link href={feature.href}>Explore</Link>
          </article>
        );
      })}
    </div>
  );
}
