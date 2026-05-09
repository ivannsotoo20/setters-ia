import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fyzon/db', '@fyzon/prompt-composer'],
  experimental: {},
};

export default nextConfig;
