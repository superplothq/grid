import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Step, Steps } from 'fumadocs-ui/components/steps';
import { SampleDemo } from '@/components/docs/sample-demo';
import { SampleConversation } from '@/components/docs/sample-conversation';
import { DocDiagram } from '@/components/docs/doc-diagram';
import { PivotDemo } from '@/components/docs/pivot-demo';
import { Pill } from '@/components/docs/pill';
import { TypeTable } from '@/components/docs/type-table';
import { Term } from '@/components/docs/term';
import { Mermaid } from '@/components/docs/mermaid';
import type { MDXComponents } from 'mdx/types';

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Steps,
    Step,
    SampleDemo,
    SampleConversation,
    DocDiagram,
    PivotDemo,
    Pill,
    TypeTable,
    Term,
    Mermaid,
    ...components,
  } satisfies MDXComponents;
}
