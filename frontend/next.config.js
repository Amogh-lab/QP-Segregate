/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Required for the multi-stage Docker build (copies only the minimal server output)
  output: 'standalone',
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
  },
  images: {
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
        pathname: '/**',
      },
      {
        // Allow the ALB hostname for image serving in production
        protocol: 'http',
        hostname: '**.amazonaws.com',
        port: '',
        pathname: '/**',
      },
    ],
  },
}

module.exports = nextConfig
