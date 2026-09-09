import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Diagrams are inlined (not <img>) so their `currentColor` strokes inherit the
// page text color and flip with web's `data-theme` toggle, which an external SVG
// cannot do. Descriptions live here so the aria narration stays out of the MDX.
const diagrams = {
  dataflow: {
    file: 'grid-dataflow-diag.svg',
    label:
      'The grid is four core components glued together by code an agent writes. A DataSource connects to storage (an API server, an in-browser WASM database, or in-memory data) and forwards the config or query it is handed. The DataModel asks the DataSource to prepare data for a config and returns it ready to render. The DataViewModel receives that data along with any local transform or formatting hooks. The Renderer, the grid instance, draws it and calls the event handlers that establish interactivity. The DataSource, DataModel, DataViewModel, and Renderer together make up the headless grid.',
  },
  'unidirectional-flow': {
    file: 'grid-unidirectional-flow.svg',
    label:
      'The loop the glue code drives, drawn so every arrow travels the same way around it. Along the bottom, a dataviewmodel instance feeds a grid instance, and an arrow labeled "draw the grid" enters the grid instance from the right, where the cycle starts. From the grid instance an arrow labeled "listen to events" rises to a junction leading into an "update viewmodel data" box. From that box the path curves back down and to the left into the dataviewmodel instance, closing the loop. A callout above expands what updating the viewmodel involves when a DataModel is in play: "Update IR" feeds "Call datamodel with updated IR", which exchanges with "get updated data from datasource" and then passes the result back down into the update step. Because no arrow ever points back the way it came, data only moves in one direction.',
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
