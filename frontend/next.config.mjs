/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/portal',
  // JS/CSS served from Frappe's public folder at /assets/portal/
  // HTML pages stay in www/portal/ for routing
  assetPrefix: '/assets/portal',
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
