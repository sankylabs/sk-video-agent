import { LiveMaya } from "@/components/LiveMaya";
import { getLead } from "@/lib/leads";

export default async function LeadChatPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const lead = await getLead(leadId);

  return (
    <main className="chat-page">
      <LiveMaya
        lead={
          lead
            ? {
                id: lead.id,
                name: lead.name,
                email: lead.email,
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
