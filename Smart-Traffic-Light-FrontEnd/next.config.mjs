
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  devIndicators: {
    position: 'bottom-right',
  },

  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: 'http://127.0.0.1:4000/api/v1/:path*',
      },
    ];
  },
};

export default nextConfig;
