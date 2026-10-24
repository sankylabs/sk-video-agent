import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectorGate } from "@/components/DirectorGate";
import { EventEditor } from "@/components/EventEditor";
import { EventsFrame } from "@/components/EventsFrame";
import {
  eventsDirectorAuthRequired,
  eventsDirectorSecret,
  isEventsDirectorAuthed,
} from "@/lib/event-auth";
import { getDirectorEvent } from "@/lib/events";
import { noindexMetadata } from "@/lib/noindex";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...noindexMetadata,
  title: "Edit event · Steamoji Kirkland",
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const authed = await isEventsDirectorAuthed();
  const event = authed ? await getDirectorEvent(id) : null;
  if (authed && !event) notFound();

  return (
    <EventsFrame
      kicker="Academy staff"
      title={event?.title || "Edit event"}
      lede="Update the details, change the spot limit until the event ends, then save a draft or publish."
    >
      <DirectorGate
        authed={authed}
        needsSetup={!authed && eventsDirectorAuthRequired() && !eventsDirectorSecret()}
        openLocally={authed && !eventsDirectorSecret()}
      >
        {event ? <EventEditor event={event} /> : null}
      </DirectorGate>
    </EventsFrame>
  );
}
