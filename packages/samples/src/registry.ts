import type { SampleEntry } from "./types";

export const samples: Record<string, SampleEntry> = {
  "column-selection": {
    load: () => import("./samples/column-selection/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-grouping": {
    load: () => import("./samples/column-grouping/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-grouping-threshold": {
    load: () => import("./samples/column-grouping/threshold-highlight"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-col-size": {
    load: () => import("./samples/column-properties/col-size"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-cell-height": {
    load: () => import("./samples/column-properties/cell-height"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-header-affixes": {
    load: () => import("./samples/column-properties/header-affixes"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-properties-cell-renderer": {
    load: () => import("./samples/column-properties/cell-renderer"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-formatter-facet": {
    load: () => import("./samples/column-formatter/facet-formatter"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-formatter-track-override": {
    load: () => import("./samples/column-formatter/track-override"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-formatter-dynamic-locale": {
    load: () => import("./samples/column-formatter/dynamic-locale"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-interaction-resize": {
    load: () => import("./samples/column-interaction/resize"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-interaction-selection": {
    load: () => import("./samples/column-interaction/selection"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-metadata-heat-bars": {
    load: () => import("./samples/column-metadata-visuals/heat-bars"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "column-metadata-percentile": {
    load: () => import("./samples/column-metadata-visuals/percentile"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "grouped-table": {
    load: () => import("./samples/hierarchical-tables/grouped"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "tree-table": {
    load: () => import("./samples/hierarchical-tables/tree"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "custom-cell-renderers": {
    load: () => import("./samples/custom-cell-renderers/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "headless-sort": {
    load: () => import("./samples/headless-sort/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "headless-filter": {
    load: () => import("./samples/headless-filter/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
  "headless-paginate": {
    load: () => import("./samples/headless-paginate/sample"),
    conversation: () => Promise.resolve({ turns: [] }),
  },
};
