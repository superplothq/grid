import { fileURLToPath } from 'node:url';
import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['samples'],
  turbopack: {
    root: fileURLToPath(new URL('../../', import.meta.url)),
  },
};

export default withMDX(config);
