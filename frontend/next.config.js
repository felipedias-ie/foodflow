/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  basePath: process.env.NODE_ENV === 'production' ? '/foodflow' : '',
  assetPrefix: process.env.NODE_ENV === 'production' ? '/foodflow' : '',
  env: {
    NEXT_PUBLIC_BASE_PATH: process.env.NODE_ENV === 'production' ? '/foodflow' : '',
  },
};

module.exports = nextConfig;