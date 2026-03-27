import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  skipTrailingSlashRedirect: true,
  /*
  turbopack: {
    root: process.cwd(),
  },
  */
  async redirects() {
    return []
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
        ],
      },
    ]
  },
};

export default nextConfig;
