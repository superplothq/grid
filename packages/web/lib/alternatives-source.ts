import path from 'node:path';
import { alternatives } from 'collections/server';
import { gridAlternativesPath } from './site-config';

export type AlternativePage = (typeof alternatives)[number];

export function alternativeSlug(page: AlternativePage) {
  return path.basename(page.info.path, '.mdx');
}

export function alternativePath(page: AlternativePage) {
  return `${gridAlternativesPath}/${alternativeSlug(page)}/`;
}

export function getAlternative(slug: string) {
  return alternatives.find((page) => alternativeSlug(page) === slug);
}

export { alternatives };
