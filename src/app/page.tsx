import { siteConfig } from "@/lib/config";

export default function HomePage() {
  return (
    <main className="page landing">
      <p className="eyebrow">{siteConfig.brand}</p>
      <h1 className="landing-title">{siteConfig.tagline}</h1>
      <p className="lede">{siteConfig.mission}</p>

      <p className="landing-meta">
        {siteConfig.address}
        <br />
        {siteConfig.hours}
        <br />
        {siteConfig.ages} · {siteConfig.phone}
      </p>

      <div className="landing-actions">
        <a className="nav-cta" href={siteConfig.freeSessionUrl}>
          Book a free session
        </a>
        <a className="ghost-link" href={siteConfig.websiteUrl}>
          Academy website
        </a>
      </div>

      <p className="landing-note">
        To talk with Maya, our AI enrollment advisor, use the personal link from
        your text or email. It looks like{" "}
        <code>/chat/your-id</code>.
      </p>
    </main>
  );
}
