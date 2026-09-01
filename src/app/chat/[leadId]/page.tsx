import { LiveMaya } from "@/components/LiveMaya";
import { SteamojiVideos } from "@/components/SteamojiVideos";
import { openLeadSession } from "@/lib/memory";

export default async function LeadChatPage({
  params,
}: {
  params: Promise<{ leadId: string }>;
}) {
  const { leadId } = await params;
  const session = await openLeadSession(leadId);

  return (
    <main className="chat-page">
      <LiveMaya
        lead={
          session.lead
            ? {
                id: session.lead.ghlContactId || session.lead.id,
                name: session.lead.name,
                email: session.lead.email,
                childName: session.lead.childName,
                childAge: session.lead.childAge,
                notes: session.lead.notes,
                bookedStart: session.lead.bookedStart,
                bookedLabel: session.lead.bookedLabel,
              }
            : { id: leadId }
        }
        initialMessages={session.messages}
      />
      <SteamojiVideos />
    </main>
  );
}
