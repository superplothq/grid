import type { FaqItem } from '@/lib/home-content';

export function FaqSection({ items }: { items: FaqItem[] }) {
  return (
    <section id="questions" aria-labelledby="questions-heading" className="section">
      <h2 id="questions-heading">Common questions</h2>
      {items.map((item) => (
        <section
          key={item.hashPath}
          id={item.hashPath}
          data-hash-path={item.hashPath}
          className="faq-item"
          suppressHydrationWarning
        >
          <details suppressHydrationWarning>
            <summary>
              <h3>{item.question}</h3>
            </summary>
            <p>{item.answer}</p>
          </details>
        </section>
      ))}
    </section>
  );
}
