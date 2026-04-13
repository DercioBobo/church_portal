/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/catequista',
  // JS/CSS served from Frappe's public folder at /assets/portal/catequista/
  assetPrefix: '/assets/portal/catequista',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
