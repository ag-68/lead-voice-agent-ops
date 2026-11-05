import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Allow both localhost and 127.0.0.1 for Next 16 dev HMR / indicator. */
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
