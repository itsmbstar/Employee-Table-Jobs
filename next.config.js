/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',          // generates /out folder — pure static HTML
  trailingSlash: true,       // /jobs/sde-google/ not /jobs/sde-google
  images: {
    unoptimized: true,       // required for static export (no server)
  },
  // Ensure all pages get proper HTML at build time
  generateBuildId: async () => {
    return 'et-build-' + Date.now();
  },
};

module.exports = nextConfig;
