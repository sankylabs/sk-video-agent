import Image from "next/image";
import Link from "next/link";
import { siteConfig } from "@/lib/config";

export function SiteHeader({ active }: { active?: "events" }) {
  return (
    <header className="home-bar">
      <div className="home-wrap home-bar-inner">
        <Link className="home-lockup" href="/">
          <span className="home-seal home-seal-sm">
            <Image
              src="/steamoji-kirkland-logo.png"
              alt=""
              fill
              sizes="48px"
              priority
            />
          </span>
          <span className="home-lockup-text">
            <span className="home-lockup-brand">{siteConfig.brand}</span>
            <span className="home-lockup-place">Kirkland, Washington</span>
          </span>
        </Link>
        <nav className="home-bar-links" aria-label="Site">
          <Link
            className={active === "events" ? "home-bar-link is-active" : "home-bar-link"}
            href="/events"
            aria-current={active === "events" ? "page" : undefined}
          >
            Events
          </Link>
          <a className="home-bar-cta" href={siteConfig.freeSessionUrl}>
            Book a free session
          </a>
        </nav>
      </div>
    </header>
  );
}
