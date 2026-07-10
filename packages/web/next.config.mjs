import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const config = {
  output: 'export',
  trailingSlash: true,
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  turbopack: {
    root: fileURLToPath(new URL('../../', import.meta.url)),
  },
};

export default config;
