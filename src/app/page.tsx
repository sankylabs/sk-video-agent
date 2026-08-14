import Link from "next/link";
import { LeadLinkForm } from "@/components/LeadLinkForm";
import { LiveMaya } from "@/components/LiveMaya";
import { siteConfig } from "@/lib/config";

export default function HomePage() {
  return (
    <main className="page home-1mind">
      <nav className="nav">
        <div className="brand-mark">{siteConfig.brand}</div>
        <div className="nav-actions">
          <Link className="ghost-link" href="/eval">
            Eval results
          </Link>
          <a className="ghost-link" href={siteConfig.freeSessionUrl}>
            Book free session
          </a>
          <Link className="nav-cta" href="/chat">
            Open full call
          </Link>
        </div>
      </nav>

      <section className="superhuman-hero">
        <div className="superhuman-brand">
          <p className="eyebrow">AI enrollment superhuman</p>
          <h1>
            {siteConfig.brand}
          </h1>
          <p className="lede">
            Don&apos;t take our word for it. Ask Maya — live on this page.
          </p>
        </div>

        <LiveMaya embedded />
      </section>

      <section className="section" id="send-link">
        <h2>Text Maya to a lead</h2>
        <p>
          Create a personalized call link and paste it into SMS. Parents open it
          and talk with Maya face-to-face style — then book a free session.
        </p>
        <LeadLinkForm />
      </section>
    </main>
  );
}
