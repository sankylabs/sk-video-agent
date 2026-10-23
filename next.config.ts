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
      { source: "/events/manage", headers: noindexHeader },
      { source: "/events/manage/:path*", headers: noindexHeader },
    ];
  },
};

export default nextConfig;
