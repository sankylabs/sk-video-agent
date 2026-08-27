import { siteConfig } from "@/lib/config";

export default function ChatIndexPage() {
  return (
    <main className="page landing">
      <p className="eyebrow">{siteConfig.brand}</p>
      <h1 className="landing-title">Maya needs a personal link</h1>
      <p className="lede">
        Chat with Maya only works from the unique link we sent you — it includes
        your contact ID, like <code>/chat/abc123</code>.
      </p>
      <p className="landing-note">
        Open the full link in your text or email. If you don’t have one, call{" "}
        {siteConfig.phone} or email {siteConfig.email}.
      </p>
      <div className="landing-actions">
        <a className="nav-cta" href={siteConfig.freeSessionUrl}>
          Book a free session
        </a>
        <a className="ghost-link" href="/">
          Back home
        </a>
      </div>
    </main>
  );
}
