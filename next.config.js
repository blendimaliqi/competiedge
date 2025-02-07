/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ["*"],
      bodySizeLimit: "2mb",
    },
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't attempt to load these modules on the client side
      config.resolve.fallback = {
        net: false,
        tls: false,
        fs: false,
        child_process: false,
        dns: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
