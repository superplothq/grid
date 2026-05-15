# Sample Guidelines

# Reference:
- packages/playground/src/grid.tsx : a grid implemetation with fixtures
- packages/playground/src/pivot-grid.tsx : a grid implementation with dimensional projection + chevrons + filter + sort ui
- core concepts: packages/docs/content/docs/dataflow.mdx

## Step to add new sample:

1. Create a .tsx file in packages/hc_samples/src/samples/ — use
packages/hc_samples/src/samples/basic-pivot.tsx as reference
2. Import it in packages/hc_samples/src/samples/index.ts
3. Optionally add an icon in packages/hc_samples/src/App.tsx in the sampleIcons map
