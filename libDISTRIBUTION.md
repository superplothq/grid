# Library Distribution

## 1. Consumer uses a bundler (Webpack 5, Vite, Rollup, esbuild)

When a consumer installs the grid library and imports it, the DuckDB WASM assets are resolved automatically — no manual setup required.

```ts
import { BrowserInMemoryDataModel } from "grid";

const model = await BrowserInMemoryDataModel.create(gridData);
```

### How it works

The grid library references WASM assets using the `new URL(..., import.meta.url)` pattern:

```ts
new URL("@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm", import.meta.url)
```

At build time, the consumer's bundler:
1. Recognizes this pattern
2. Resolves `@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm` from `node_modules`
3. Copies the `.wasm` and worker `.js` files to the output directory
4. Rewrites the URL to point to the output path (e.g., `/assets/duckdb-mvp.abc123.wasm`)

The consumer does **not** need to:
- Copy WASM files manually
- Configure `CopyWebpackPlugin` or equivalent
- Pass bundle paths to `BrowserInMemoryDataModel.create()`

### Override

If needed, consumers can still pass explicit bundle paths:

```ts
const model = await BrowserInMemoryDataModel.create(gridData, {
  mvp: {
    mainModule: "/custom/path/duckdb-mvp.wasm",
    mainWorker: "/custom/path/duckdb-browser-mvp.worker.js",
  },
});
```

### Requirements

- Bundler must support `new URL(..., import.meta.url)` asset references (Webpack 5+, Vite, Rollup with plugins, esbuild)
- Server must set COOP/COEP headers for SharedArrayBuffer support:
  ```
  Cross-Origin-Embedder-Policy: require-corp
  Cross-Origin-Opener-Policy: same-origin
  ```

### Note on COOP/COEP headers

DuckDB WASM ships three bundle tiers:
- **MVP** — minimal, single-threaded
- **EH** — adds WASM exception handling, still single-threaded
- **COI** — cross-origin isolated, multithreaded via `pthreadWorker`, requires `SharedArrayBuffer`

The COOP/COEP headers are **only required for the COI bundle**. The MVP and EH bundles run single-threaded and work without these headers. `duckdb.selectBundle()` checks `globalThis.crossOriginIsolated` at runtime and picks the COI bundle only when available and the headers are set.

The grid library currently provides only MVP and EH bundles in its defaults — **no COOP/COEP headers are needed** for the default configuration. The headers only become necessary if a consumer explicitly provides a COI bundle for multithreaded performance.

---

## 2. CDN distribution (no bundler)

For consumers loading the library via `<script type="module">` from a CDN, an additional build step is needed to produce a self-contained distribution.

### Build step

Use a bundler (Rollup, esbuild, etc.) to create a CDN-ready build that:
1. Bundles the grid library into a single ESM file
2. Processes `new URL(..., import.meta.url)` patterns — copies WASM/worker assets and rewrites URLs to relative paths

Output structure:
```
dist-cdn/
  grid.esm.js
  duckdb-mvp.wasm
  duckdb-browser-mvp.worker.js
  duckdb-eh.wasm
  duckdb-browser-eh.worker.js
```

### Hosting

Host the entire `dist-cdn/` directory on the CDN. The relative URLs in `grid.esm.js` resolve against the script's own URL:

```
https://cdn.example.com/grid/grid.esm.js
https://cdn.example.com/grid/duckdb-mvp.wasm
https://cdn.example.com/grid/duckdb-browser-mvp.worker.js
...
```

### Cross-origin worker issue

Web Workers cannot be loaded from a cross-origin URL via `new Worker(url)`. When the library is served from a CDN (different origin than the consuming page), worker creation fails.

Workaround — use a blob URL that loads the cross-origin script via `importScripts()`:

```js
const workerUrl = URL.createObjectURL(
  new Blob([`importScripts("${cdnWorkerUrl}");`], { type: "text/javascript" })
);
const worker = new Worker(workerUrl);
URL.revokeObjectURL(workerUrl);
```

This is not yet implemented in the library. Until then, CDN consumers should pass explicit bundle paths with same-origin worker files, or self-host the worker scripts.

### CORS headers

The CDN must serve all assets with appropriate CORS headers:
```
Access-Control-Allow-Origin: *
```

The consuming page only needs COOP/COEP headers if using the COI bundle for multithreaded DuckDB. With the default MVP/EH bundles (single-threaded), these headers are not required.
