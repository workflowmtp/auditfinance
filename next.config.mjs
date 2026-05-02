/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Vercel configuration - serverless deployment
    experimental: {
        // Enable if needed for larger API responses
        largePageDataBytes: 128 * 1000, // 128KB
    },
    // PostgreSQL connection is handled via environment variables on Vercel
    env: {
        // These will be overridden by Vercel environment variables
        DB_SCHEMA: process.env.DB_SCHEMA || 'analytics',
        DEFAULT_LIMIT: process.env.DEFAULT_LIMIT || '50',
        PGSSL: process.env.PGSSL || 'false',
    },
};

export default nextConfig;