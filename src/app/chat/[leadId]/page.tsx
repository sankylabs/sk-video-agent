import { LiveMaya } from "@/components/LiveMaya";
import { getLead } from "@/lib/leads";
import { siteConfig } from "@/lib/config";

export default async function LeadChatPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const lead = await getLead(leadId);

  return (
    <main className="chat-page">
      <header className="chat-page-head">
        <p className="eyebrow">{siteConfig.brand}</p>
        <h1>Talk with {siteConfig.personaName}</h1>
      </header>
      <LiveMaya
        lead={
          lead
            ? {
                id: lead.id,
                name: lead.name,
                childName: lead.childName,
                childAge: lead.childAge,
                notes: lead.notes,
              }
            : { id: leadId }
        }
      />
    </main>
  );
}
