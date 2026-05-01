import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@fyzon/db'],
  experimental: {},
};

export default nextConfig;
