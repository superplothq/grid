import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Diagrams are inlined (not <img>) so their `currentColor` strokes inherit the
// page text color and flip with web's `data-theme` toggle, which an external SVG
// cannot do. Descriptions live here so the aria narration stays out of the MDX.
const diagrams = {
  dataflow: {
    file: 'grid-dataflow-diag.svg',
    label:
      'The grid is four layers glued together by code an agent writes. A DataSource connects to storage (an API server, an in-browser WASM database, or in-memory data) and forwards the config or query it is handed. The DataModel asks the DataSource to prepare data for a config and returns it ready to render. The DataViewModel receives that data along with any local transform or formatting hooks. The Renderer, the grid instance, draws it and calls the event handlers that establish interactivity. The DataSource, DataModel, DataViewModel, and Renderer together make up the headless grid.',
  },
  'metadata-flow': {
    file: 'grid-metadata-flow.svg',
    label:
      'How metadata flows through the pipeline. Inside DataModel.getViewModelData(config), a resolver you provide defines what extra data to fetch, for example SQL expressions appended to the query. getData then fetches data and metadata together, and a reshaper you provide maps the raw results into ViewModel coordinates. The DataModel returns params with metadata to ViewModel.updateData(params), which stores the metadata and builds its Map indexes. The Renderer calls your cellRenderer(data, dataCtx, ctx), which reads dataCtx.viewModel.metadata, for example getValueCellMeta(col, row), to style the cell. Dashed boxes are the pieces you provide; solid boxes are the grid core.',
  },
} as const;

export function DocDiagram({ id }: { id: keyof typeof diagrams }) {
  const { file, label } = diagrams[id];
  const raw = readFileSync(join(process.cwd(), 'public', file), 'utf8');
  const svg = raw.slice(raw.indexOf('<svg'));

  return (
    <figure className="doc-diagram not-prose">
      <div
        className="doc-diagram-svg"
        role="img"
        aria-label={label}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </figure>
  );
}
