/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  ...(isProd && { output: 'export' }),
  images: { unoptimized: true },
  basePath: isProd ? '/foodflow' : '',
  assetPrefix: isProd ? '/foodflow' : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: isProd ? '/foodflow' : '',
  },
};

module.exports = nextConfig;