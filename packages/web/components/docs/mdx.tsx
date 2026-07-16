import defaultMdxComponents from 'fumadocs-ui/mdx';
import { SampleDemo } from '@/components/docs/sample-demo';
import { SampleConversation } from '@/components/docs/sample-conversation';
import { DocDiagram } from '@/components/docs/doc-diagram';
import { PivotDemo } from '@/components/docs/pivot-demo';
import { Pill } from '@/components/docs/pill';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    SampleDemo,
    SampleConversation,
    DocDiagram,
    PivotDemo,
    Pill,
    ...components,
  } satisfies MDXComponents;
}
