import defaultMdxComponents from 'fumadocs-ui/mdx';
import { SampleDemo } from '@/components/docs/sample-demo';
import { SampleConversation } from '@/components/docs/sample-conversation';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    SampleDemo,
    SampleConversation,
    ...components,
  } satisfies MDXComponents;
}
