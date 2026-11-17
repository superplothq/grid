import type { MetadataRoute } from 'next';
import { blogPath, blogs } from '@/lib/blog-source';
import { source } from '@/lib/docs-source';
import {
  aboutPath,
  contactPath,
  gridBasePath,
  ourApproachPath,
  siteUrl,
} from '@/lib/site-config';

export const dynamic = 'force-static';

function absolute(path: string) {
  return `${siteUrl}${path.endsWith('/') ? path : `${path}/`}`;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const pages = [gridBasePath, ourApproachPath, aboutPath, contactPath].map((path) => ({
    url: absolute(path),
  }));
  const docs = source.getPages().map((page) => ({ url: absolute(page.url) }));
  const posts = blogs.map((post) => ({
    url: absolute(blogPath(post)),
    lastModified: post.published,
  }));
  return [...pages, ...docs, ...posts];
}
