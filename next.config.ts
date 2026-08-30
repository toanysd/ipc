import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['node-onvif', 'fluent-ffmpeg'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
