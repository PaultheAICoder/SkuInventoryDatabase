/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  eslint: {
    // ESLint 9 flat config is not fully supported by Next.js 14's built-in integration.
    // Run ESLint separately via `npm run lint` which uses the flat config correctly.
    ignoreDuringBuilds: true,
  },
}

module.exports = nextConfig
