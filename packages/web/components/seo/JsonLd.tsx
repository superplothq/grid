import type { FaqItem } from '@/lib/home-content';
import { contactEmail, gridBasePath, githubUrl, siteName, siteUrl } from '@/lib/site-config';

export interface Breadcrumb {
  name: string;
  path: string;
}

export function JsonLd({
  faqItems,
  breadcrumbs,
}: {
  faqItems?: FaqItem[];
  breadcrumbs?: Breadcrumb[];
}) {
  const documents: object[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: siteName,
      url: siteUrl,
      email: contactEmail,
      sameAs: [githubUrl],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: siteName,
      url: siteUrl,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: siteName,
      applicationCategory: 'DeveloperApplication',
      operatingSystem: 'Web',
      url: `${siteUrl}${gridBasePath}`,
      description:
        'A JavaScript grid library built for coding agents: composable primitives for tables, tree tables, and pivot tables over a fullstack SQL data pipeline.',
    },
  ];

  if (breadcrumbs && breadcrumbs.length > 0) {
    documents.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: breadcrumbs.map((crumb, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: crumb.name,
        item: `${siteUrl}${crumb.path}`,
      })),
    });
  }

  if (faqItems && faqItems.length > 0) {
    documents.push({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqItems.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    });
  }

  return (
    <>
      {documents.map((document, index) => (
        <script
          key={index}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(document) }}
        />
      ))}
    </>
  );
}
