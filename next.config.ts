import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  serverExternalPackages: ['node-onvif', 'fluent-ffmpeg'],
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
