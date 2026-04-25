import type { NextConfig } from "next";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Add any standard Next.js config options here (like images, redirects, etc.)
};

export default withSerwist(nextConfig);
