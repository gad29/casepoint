import type { NextConfig } from 'next';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  output: 'standalone',
  typedRoutes: true,
  // Avoid picking a parent-folder lockfile as the tracing root (common when ~/package-lock.json exists).
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
