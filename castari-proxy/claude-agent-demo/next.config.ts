import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname
  },
  experimental: {
    externalDir: true
  },
  transpilePackages: ["castari-proxy"]
};

export default nextConfig;
