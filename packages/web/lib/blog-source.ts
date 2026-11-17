import path from 'node:path';
import { blogs } from 'collections/server';
import { gridBlogsPath } from './site-config';

export type BlogPost = (typeof blogs)[number];

export function blogSlug(post: BlogPost) {
  return path.basename(post.info.path, '.mdx');
}

export function blogPath(post: BlogPost) {
  return `${gridBlogsPath}/${blogSlug(post)}/`;
}

export function getBlogPost(slug: string) {
  return blogs.find((post) => blogSlug(post) === slug);
}

export { blogs };
