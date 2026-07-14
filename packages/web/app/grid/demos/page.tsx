import type { Metadata } from 'next';
import Link from 'next/link';
import { demos } from 'samples';

export const metadata: Metadata = {
  title: 'Demos',
  description: 'Self-contained grid demos.',
};

export default function DemosPage() {
  const entries = Object.entries(demos);

  return (
    <main style={{ maxWidth: 760, margin: '0 auto', padding: '56px 24px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 6 }}>Demos</h1>
      <p style={{ opacity: 0.7, marginBottom: 28 }}>
        Self-contained grid demos, each on its own page. Open any in a new tab.
      </p>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map(([id, demo]) => (
          <li key={id}>
            <Link
              href={`/grid/demos/${id}`}
              style={{
                display: 'block',
                padding: '14px 16px',
                borderRadius: 10,
                border: '1px solid color-mix(in srgb, currentColor 15%, transparent)',
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              <div style={{ fontWeight: 600 }}>{demo.title}</div>
              <div style={{ opacity: 0.7, fontSize: 14, marginTop: 2 }}>{demo.description}</div>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
