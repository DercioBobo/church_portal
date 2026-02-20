/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/portal',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
