import { source } from '@/lib/docs-source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/docs/mdx';
import { DocsRootRedirect } from '@/components/docs/docs-root-redirect';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';

const docsRootRedirect = '/grid/docs/installation/';

export default async function Page(props: PageProps<'/grid/docs/[[...slug]]'>) {
  const params = await props.params;
  if (!params.slug || params.slug.length === 0) {
    return <DocsRootRedirect to={docsRootRedirect} />;
  }
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full} tableOfContent={{ style: 'clerk' }}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return [{ slug: [] as string[] }, ...source.generateParams()];
}

export async function generateMetadata(props: PageProps<'/grid/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  if (!params.slug || params.slug.length === 0) {
    return { title: 'Documentation' };
  }
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
