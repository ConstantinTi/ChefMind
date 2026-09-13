import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces .next/standalone — a self-contained server bundle for the Docker image.
  output: 'standalone',

  // better-sqlite3 and sharp are native modules. Without this webpack tries to
  // bundle them and you get "Cannot find module" at runtime, in the container
  // only, in production only. Do not remove.
  serverExternalPackages: ['better-sqlite3', 'sharp'],

  // We generate exactly two image sizes ourselves at upload time, so Next's
  // optimizer would only add weight to the runtime.
  images: { unoptimized: true },
};

export default nextConfig;
