import { docs, samples } from 'collections/server';
import { loader } from 'fumadocs-core/source';
import { docsPath } from './site-config';

export const source = loader({
  baseUrl: docsPath,
  source: {
    docs: docs.toFumadocsSource(),
    samples: samples.toFumadocsSource(),
  },
  plugins: [],
});
