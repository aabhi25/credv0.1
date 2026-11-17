import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep the dev-mode badge clear of the sidebar controls.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
