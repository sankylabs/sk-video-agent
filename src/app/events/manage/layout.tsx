import type { ReactNode } from "react";
import { DirectorSignOut } from "@/components/DirectorSignOut";
import { EventsFrame } from "@/components/EventsFrame";
import { isEventsDirectorAuthed } from "@/lib/event-auth";

export default async function EventsManageLayout({ children }: { children: ReactNode }) {
  const authed = await isEventsDirectorAuthed();

  return (
    <EventsFrame
      kicker="Academy staff"
      title="Director"
      lede="Published events and their registrations come first. Drafts stay internal until you publish."
      aside={authed ? <DirectorSignOut /> : null}
    >
      {children}
    </EventsFrame>
  );
}
