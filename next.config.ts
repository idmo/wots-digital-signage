import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Smaller production image (Dockerfile copies .next/standalone) — PRD §11.4/§11.5.
  output: "standalone",
};

export default nextConfig;
