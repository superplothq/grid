import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { demos } from 'samples';
import { DemoHost } from '@/components/demos/demo-host';

export function generateStaticParams() {
  return Object.keys(demos).map((id) => ({ id }));
}

export async function generateMetadata(props: PageProps<'/grid/demos/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const demo = demos[id];
  if (!demo) return { title: 'Demo' };
  return { title: demo.title, description: demo.description };
}

export default async function DemoPage(props: PageProps<'/grid/demos/[id]'>) {
  const { id } = await props.params;
  const demo = demos[id];
  if (!demo) notFound();

  return (
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '32px 24px' }}>
      <Link href="/grid/demos" style={{ fontSize: 14, opacity: 0.7, textDecoration: 'none', color: 'inherit' }}>
        &larr; Demos
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: '12px 0 4px' }}>{demo.title}</h1>
      <p style={{ opacity: 0.7, marginBottom: 20 }}>{demo.description}</p>
      <DemoHost id={id} />
    </main>
  );
}
