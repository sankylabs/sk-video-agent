import type { Metadata } from "next";
import { Bungee, Nunito_Sans } from "next/font/google";
import "./globals.css";
import { siteConfig } from "@/lib/config";

const display = Bungee({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const body = Nunito_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const siteUrl = new URL(
  process.env.PUBLIC_APP_URL || "https://www.steamojikirkland.com",
);

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: `${siteConfig.personaName} · ${siteConfig.brand}`,
  description: `Video chat with ${siteConfig.personaName}, AI enrollment advisor for ${siteConfig.brand}. Book a free STEM maker session for your child.`,
  icons: {
    icon: [{ url: "/steamoji-kirkland-logo.png", type: "image/png" }],
    apple: [{ url: "/steamoji-kirkland-logo.png" }],
  },
  openGraph: {
    title: `${siteConfig.personaName} · ${siteConfig.brand}`,
    description: `Video chat with ${siteConfig.personaName}, AI enrollment advisor for ${siteConfig.brand}. Book a free STEM maker session for your child.`,
    url: siteUrl,
    siteName: siteConfig.brand,
    type: "website",
    images: [
      {
        url: "/steamoji-kirkland-logo.png",
        width: 1024,
        height: 1024,
        alt: siteConfig.brand,
      },
    ],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
