import { LeadLinkForm } from "@/components/LeadLinkForm";
import { siteConfig } from "@/lib/config";

export default function SendLinkPage() {
  return (
    <main className="page">
      <p className="eyebrow">{siteConfig.brand}</p>
      <section className="section" id="send-link">
        <h2>Text Maya to a lead</h2>
        <p>
          Create a personalized call link. Parents open{" "}
          <code>/chat/{"{contact id}"}</code> and talk with Maya.
        </p>
        <LeadLinkForm />
      </section>
    </main>
  );
}
