import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Generate a standalone output directory for Docker deployment.
  // This produces .next/standalone with all required node_modules bundled,
  // allowing the container to run with just: node server.js
  output: 'standalone',
};

export default nextConfig;
