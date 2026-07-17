import Link from 'next/link';
import type { Principle } from '@/lib/home-content';

export function PrinciplesSection({ principles }: { principles: Principle[] }) {
  return (
    <section id="principles" aria-labelledby="principles-heading" className="section">
      <h2 id="principles-heading">Our guiding principles</h2>
      <p className="section-lead">
        SuperPlot is agent-first by design. Instead of a monolithic component with hundreds of
        options, it offers composable layers with typed contracts that agents and humans can reason
        about, generate, and verify.
      </p>
      <div className="card-grid card-grid-3">
        {principles.map((principle) => (
          <article key={principle.slug} className="card">
            <h3>{principle.title}</h3>
            <p>{principle.body}</p>
            <Link href={principle.href}>Learn more</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
