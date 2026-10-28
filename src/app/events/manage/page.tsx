import type { Metadata } from "next";
import { DirectorBoard } from "@/components/DirectorBoard";
import { DirectorGate } from "@/components/DirectorGate";
import {
  eventsDirectorAuthRequired,
  eventsDirectorSecret,
  isEventsDirectorAuthed,
} from "@/lib/event-auth";
import { groupDirectorEvents, paginate } from "@/lib/event-model";
import { listDirectorEvents, syncPendingEventRegistrations } from "@/lib/events";
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
  if (authed) await syncPendingEventRegistrations();
  const grouped = groupDirectorEvents(authed ? await listDirectorEvents() : []);
  const published = paginate(grouped.publishedCurrent, params.page);
  const drafts = paginate(grouped.drafts, params.drafts);
  const completed = paginate(grouped.completed, params.past);

  return (
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
  );
}
