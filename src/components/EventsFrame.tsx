import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/SiteHeader";
import { siteConfig } from "@/lib/config";

export function EventsFrame({
  kicker,
  title,
  lede,
  aside,
  children,
}: {
  kicker: string;
  title: string;
  lede: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main className="home">
      <SiteHeader active="events" />
      <section className="events-hero">
        <div className="home-wrap events-hero-bar">
          <div className="events-hero-copy">
            <p className="home-kicker">{kicker}</p>
            <h1>{title}</h1>
            <p>{lede}</p>
          </div>
          {aside ? <div className="events-hero-aside">{aside}</div> : null}
        </div>
      </section>
      <div className="home-body">
        <div className="home-wrap events-main">{children}</div>
        <footer className="home-wrap home-foot">
          <div>
            <p className="home-foot-brand">{siteConfig.brand}</p>
            <p>{siteConfig.address}</p>
            <p>{siteConfig.hours}</p>
          </div>
          <div className="home-foot-links">
            <Link href="/events">All events</Link>
            <a href={`tel:${siteConfig.phone.replace(/\D/g, "")}`}>{siteConfig.phone}</a>
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
