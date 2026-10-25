import type { Metadata } from "next";
import { DirectorGate } from "@/components/DirectorGate";
import { EventEditor } from "@/components/EventEditor";
import {
  eventsDirectorAuthRequired,
  eventsDirectorSecret,
  isEventsDirectorAuthed,
} from "@/lib/event-auth";
import { noindexMetadata } from "@/lib/noindex";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...noindexMetadata,
  title: "Add event · Steamoji Kirkland",
};

export default async function NewEventPage() {
  const authed = await isEventsDirectorAuthed();

  return (
    <DirectorGate
      authed={authed}
      needsSetup={!authed && eventsDirectorAuthRequired() && !eventsDirectorSecret()}
      openLocally={authed && !eventsDirectorSecret()}
    >
      <EventEditor event={null} />
    </DirectorGate>
  );
}
