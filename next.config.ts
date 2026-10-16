import type { NextConfig } from "next";

const noindexHeader = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/maya", headers: noindexHeader },
      { source: "/maya/:path*", headers: noindexHeader },
      { source: "/eval", headers: noindexHeader },
      { source: "/eval/:path*", headers: noindexHeader },
    ];
  },
};

export default nextConfig;
