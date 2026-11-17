import type { Metadata } from 'next';
import type { ComponentProps } from 'react';
import { notFound } from 'next/navigation';
import { JsonLd } from '@/components/seo/JsonLd';
import { blogPath, blogs, blogSlug, getBlogPost } from '@/lib/blog-source';
import { gridBasePath, siteName, siteUrl } from '@/lib/site-config';

function BlogTable(props: ComponentProps<'table'>) {
  return (
    <div className="blog-table-wrap">
      <table {...props} />
    </div>
  );
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
  return blogs.map((post) => ({ id: blogSlug(post) }));
}

export async function generateMetadata(props: PageProps<'/grid/blogs/[id]'>): Promise<Metadata> {
  const { id } = await props.params;
  const post = getBlogPost(id);
  if (!post) notFound();

  const url = `${siteUrl}${blogPath(post)}`;
  const image = { url: post.image, width: 1200, height: 630, alt: post.title };

  return {
    title: { absolute: post.title },
    description: post.description,
    authors: [{ name: post.author }],
    alternates: { canonical: url },
    openGraph: {
      type: 'article',
      siteName,
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.published,
      authors: [post.author],
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.description,
      images: [image],
    },
  };
}

export default async function BlogPostPage(props: PageProps<'/grid/blogs/[id]'>) {
  const { id } = await props.params;
  const post = getBlogPost(id);
  if (!post) notFound();

  const MDX = post.body;

  return (
    <main className="blog-main">
      <JsonLd
        breadcrumbs={[
          { name: 'Grid', path: gridBasePath },
          { name: post.title, path: blogPath(post) },
        ]}
        article={{
          headline: post.title,
          description: post.description,
          path: blogPath(post),
          image: post.image,
          author: post.author,
          datePublished: post.published,
        }}
        faqItems={post.faq}
      />
      <article>
        <header className="route-hero blog-hero">
          <h1>{post.title}</h1>
          <p className="blog-meta">
            <time dateTime={post.published}>{formatDate(post.published)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.author}</span>
          </p>
          <p className="route-hero-lead">{post.lead}</p>
        </header>
        <div className="blog-body">
          <MDX components={{ table: BlogTable }} />
          {post.faq.length > 0 && (
            <section aria-labelledby="frequently-asked-questions">
              <h2 id="frequently-asked-questions">Frequently asked questions</h2>
              {post.faq.map((item) => (
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
