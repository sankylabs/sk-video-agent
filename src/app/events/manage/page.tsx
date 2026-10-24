import type { Metadata } from "next";
import { DirectorBoard } from "@/components/DirectorBoard";
import { DirectorGate } from "@/components/DirectorGate";
import { EventsFrame } from "@/components/EventsFrame";
import {
  eventsDirectorAuthRequired,
  eventsDirectorSecret,
  isEventsDirectorAuthed,
} from "@/lib/event-auth";
import { groupDirectorEvents, paginate } from "@/lib/event-model";
import { listDirectorEvents } from "@/lib/events";
import { noindexMetadata } from "@/lib/noindex";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...noindexMetadata,
  title: "Director · Steamoji Kirkland",
};

export default async function EventsManagePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; drafts?: string; past?: string; notice?: string }>;
}) {
  const authed = await isEventsDirectorAuthed();
  const params = await searchParams;
  const grouped = groupDirectorEvents(authed ? await listDirectorEvents() : []);
  const published = paginate(grouped.publishedCurrent, params.page);
  const drafts = paginate(grouped.drafts, params.drafts);
  const completed = paginate(grouped.completed, params.past);

  return (
    <EventsFrame
      kicker="Academy staff"
      title="Director"
      lede="Published events and their registrations come first. Drafts stay internal until you publish."
    >
      <DirectorGate
        authed={authed}
        needsSetup={!authed && eventsDirectorAuthRequired() && !eventsDirectorSecret()}
        openLocally={authed && !eventsDirectorSecret()}
      >
        <DirectorBoard
          published={{ ...published, param: "page" }}
          drafts={{ ...drafts, param: "drafts" }}
          completed={{ ...completed, param: "past" }}
          query={{ page: params.page, drafts: params.drafts, past: params.past }}
          notice={params.notice}
        />
      </DirectorGate>
    </EventsFrame>
  );
}
