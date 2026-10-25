import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectorGate } from "@/components/DirectorGate";
import { EventEditor } from "@/components/EventEditor";
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
    <DirectorGate
      authed={authed}
      needsSetup={!authed && eventsDirectorAuthRequired() && !eventsDirectorSecret()}
      openLocally={authed && !eventsDirectorSecret()}
    >
      {event ? <EventEditor event={event} /> : null}
    </DirectorGate>
  );
}
