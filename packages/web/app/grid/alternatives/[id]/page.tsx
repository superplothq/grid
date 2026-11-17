import type { Metadata } from 'next';
import type { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { alternativePath, alternatives, alternativeSlug, getAlternative } from '@/lib/alternatives-source';
import { gridBasePath, siteName, siteUrl } from '@/lib/site-config';

function AlternativeTable(props: ComponentProps<'table'>) {
  return (
    <div className="blog-table-wrap">
      <table {...props} />
    </div>
  );
}

function AlternativeLink(props: ComponentProps<'a'>) {
  const external = /^https?:\/\//.test(props.href ?? '');
  return <a {...props} rel={external ? 'nofollow' : props.rel} />;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function generateStaticParams() {
  return alternatives.map((page) => ({ id: alternativeSlug(page) }));
}

export async function generateMetadata(props: PageProps<'/grid/alternatives/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const page = getAlternative(id);
  if (!page) notFound();

  const url = `${siteUrl}${alternativePath(page)}`;
  const image = { url: page.image, width: 1200, height: 630, alt: page.title };

  return {
    title: { absolute: page.title },
    description: page.description,
    authors: [{ name: page.author }],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName,
      url,
      title: page.title,
      description: page.description,
      publishedTime: page.published,
      authors: [page.author],
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: page.title,
      description: page.description,
      images: [image],
    },
  };
}

export default async function AlternativePage(props: PageProps<'/grid/alternatives/[id]'>) {
  const { id } = await props.params;
  const page = getAlternative(id);
  if (!page) notFound();

  const MDX = page.body;

  return (
    <main className="blog-main">
      <JsonLd
        breadcrumbs={[
          { name: 'Grid', path: gridBasePath },
          { name: page.title, path: alternativePath(page) },
        ]}
        article={{
          headline: page.title,
          description: page.description,
          path: alternativePath(page),
          image: page.image,
          author: page.author,
          datePublished: page.published,
        }}
        faqItems={page.faq}
      />
      <article>
        <header className="route-hero blog-hero">
          <h1>{page.title}</h1>
          <p className="blog-meta">
            <time dateTime={page.published}>{formatDate(page.published)}</time>
            <span aria-hidden="true">·</span>
            <span>{page.author}</span>
          </p>
          <p className="route-hero-lead">{page.lead}</p>
        </header>
        <div className="blog-body">
          <MDX components={{ a: AlternativeLink, table: AlternativeTable }} />
          {page.faq.length > 0 && (
            <section aria-labelledby="frequently-asked-questions">
              <h2 id="frequently-asked-questions">Frequently asked questions</h2>
              {page.faq.map((item) => (
                <div key={item.question}>
                  <h3>{item.question}</h3>
                  <p>{item.answer}</p>
                </div>
              ))}
            </section>
          )}
        </div>
      </article>
    </main>
  );
}
