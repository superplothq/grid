import { source } from '@/lib/docs-source';
import { siteUrl } from '@/lib/site-config';

// Emits an llms.txt index of every docs and samples page at /grid/docs/llms.txt.
// force-static so it is written as a plain file in the static export.
export const dynamic = 'force-static';
export const revalidate = false;

export function GET() {
  const pages = source.getPages();

  const format = (page: (typeof pages)[number]) => {
    const desc = page.data.description ? `: ${page.data.description}` : '';
    return `- [${page.data.title}](${siteUrl}${page.url})${desc}`;
  };

  const docs = pages.filter((p) => !p.url.includes('/samples/'));
  const samples = pages.filter((p) => p.url.includes('/samples/'));

  const lines = [
    '# SuperPlot Grid',
    '',
    '> An agent-first, headless data grid: a layered pipeline from SQL datasource to renderer, a fullstack query layer, and pivots expressed as table algebra.',
    '',
    '## Docs',
    '',
    ...docs.map(format),
  ];

  if (samples.length > 0) {
    lines.push('', '## Samples', '', ...samples.map(format));
  }

  lines.push('');

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
