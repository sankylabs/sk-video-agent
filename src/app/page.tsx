import Image from "next/image";
import { SteamojiVideos } from "@/components/SteamojiVideos";
import { siteConfig } from "@/lib/config";

const FEATURES = [
  {
    kicker: "Parent app",
    title: "See progress after every session",
    body: "Photos, notes, and what your child worked on — without asking them to recap the afternoon.",
  },
  {
    kicker: "Artifact video",
    title: "Watch what they built",
    body: "Each project is captured on video so families can see the making, not just hear about it.",
  },
  {
    kicker: "10 levels · 2 years",
    title: "A path with real rewards",
    body: "Curriculum that grows with them — levels, badges, and a Maker Mindset they can take anywhere.",
  },
  {
    kicker: "Self-book",
    title: "Schedule in the app",
    body: "Parents book and manage sessions themselves once they have access — no phone tag required.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="home">
      <header className="home-bar">
        <div className="home-wrap home-bar-inner">
          <a className="home-lockup" href="/">
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
          </a>
          <a className="home-bar-cta" href={siteConfig.freeSessionUrl}>
            Book a free session
          </a>
        </div>
      </header>

      <section className="home-hero">
        <div className="home-wrap home-hero-inner">
          <div className="home-hero-copy">
            <p className="home-kicker">Hands-on STEM makerspace · {siteConfig.ages}</p>
            <h1 className="home-title">{siteConfig.tagline}</h1>
            <p className="home-mission">{siteConfig.mission}</p>
            <div className="home-actions">
              <a className="home-cta" href={siteConfig.freeSessionUrl}>
                Book a free session
              </a>
              <a className="home-ghost" href={siteConfig.websiteUrl}>
                Academy website
              </a>
            </div>
            <p className="home-pin">{siteConfig.address}</p>
          </div>

          <div className="home-hero-mark">
            <div className="home-seal home-seal-lg">
              <Image
                src="/steamoji-kirkland-logo.png"
                alt="Steamoji Kirkland"
                fill
                sizes="240px"
                priority
              />
            </div>
            <p className="home-seal-caption">Master Makers · Kirkland</p>
          </div>
        </div>
        <div className="home-hero-stripe" aria-hidden="true" />
      </section>

      <div className="home-body">
        <section className="home-wrap home-stats" aria-label="Academy snapshot">
          <div>
            <strong>{siteConfig.ages}</strong>
            <span>After school &amp; weekends</span>
          </div>
          <div>
            <strong>10 levels</strong>
            <span>About two years of making</span>
          </div>
          <div>
            <strong>Kirkland</strong>
            <span>Downtown on Kirkland Ave</span>
          </div>
          <div>
            <strong>Parent app</strong>
            <span>Progress you can actually see</span>
          </div>
        </section>

        <section className="home-wrap home-features" aria-labelledby="home-features-heading">
          <div className="home-section-head">
            <p className="home-kicker home-kicker-dark">Why families stay</p>
            <h2 id="home-features-heading">Making what they love. Proof you can see.</h2>
          </div>
          <div className="home-feature-grid">
            {FEATURES.map((feature) => (
              <article key={feature.kicker} className="home-feature">
                <p className="home-feature-kicker">{feature.kicker}</p>
                <h3>{feature.title}</h3>
                <p>{feature.body}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="home-wrap">
          <SteamojiVideos />
        </div>

        <footer className="home-wrap home-foot">
          <div>
            <p className="home-foot-brand">{siteConfig.brand}</p>
            <p>{siteConfig.address}</p>
            <p>{siteConfig.hours}</p>
          </div>
          <div className="home-foot-links">
            <a href={`tel:${siteConfig.phone.replace(/\D/g, "")}`}>{siteConfig.phone}</a>
            <a href={`mailto:${siteConfig.email}`}>{siteConfig.email}</a>
            <a href={siteConfig.websiteUrl}>steamoji.com/wa-kirkland</a>
          </div>
        </footer>
      </div>
    </main>
  );
}
