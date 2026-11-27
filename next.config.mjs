/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: [
      'playwright',
      'playwright-core',
      'node-cron',
      'firebase-admin',
    ],
    instrumentationHook: true,
  },
};

export default nextConfig;
