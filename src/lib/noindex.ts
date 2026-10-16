import type { Metadata } from "next";

/** Staff-only pages — keep out of Google and other crawlers. */
export const noindexMetadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      nosnippet: true,
    },
  },
};
