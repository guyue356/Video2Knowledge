import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allows isolated CI/preview builds without contending with a running dev server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
