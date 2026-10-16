import Link from "next/link";
import { MayaReport } from "@/components/MayaReport";
import { siteConfig } from "@/lib/config";

export const dynamic = "force-dynamic";

export default function MayaReportPage() {
  return (
    <main className="page maya-page">
      <nav className="nav">
        <Link className="brand-mark" href="/">
          {siteConfig.brand}
        </Link>
        <div className="nav-actions">
          <Link className="ghost-link" href="/send">
            Send a lead link
          </Link>
          <Link className="nav-cta" href="/eval">
            Evals
          </Link>
        </div>
      </nav>
      <MayaReport />
    </main>
  );
}
