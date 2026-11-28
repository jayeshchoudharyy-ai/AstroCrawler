/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'playwright',
      'playwright-core',
      'node-cron',
    ],
    instrumentationHook: true,
  },
};

export default nextConfig;
