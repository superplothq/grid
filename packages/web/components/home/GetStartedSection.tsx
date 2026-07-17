import Link from 'next/link';
import type { GetStartedStep } from '@/lib/home-content';

export function GetStartedSection({
  steps,
  primaryHref,
}: {
  steps: GetStartedStep[];
  primaryHref: string;
}) {
  return (
    <section id="get-started" aria-labelledby="get-started-heading" className="section">
      <h2 id="get-started-heading">Get started</h2>
      <ol className="get-started-steps">
        {steps.map((step) => (
          <li key={step.title}>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            {step.code ? (
              <pre>
                <code>{step.code}</code>
              </pre>
            ) : null}
          </li>
        ))}
      </ol>
      <p className="section-cta">
        <Link className="button button-primary" href={primaryHref}>
          Read the docs
        </Link>
      </p>
    </section>
  );
}
