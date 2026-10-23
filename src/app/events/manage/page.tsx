import type { Metadata } from "next";
import { EventDirector } from "@/components/EventDirector";
import { EventsFrame } from "@/components/EventsFrame";
import {
  eventsDirectorAuthRequired,
  eventsDirectorSecret,
  isEventsDirectorAuthed,
} from "@/lib/event-auth";
import { listDirectorEvents } from "@/lib/events";
import { noindexMetadata } from "@/lib/noindex";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  ...noindexMetadata,
  title: "Director · Steamoji Kirkland",
};

export default async function EventsManagePage() {
  const authed = await isEventsDirectorAuthed();
  const events = authed ? await listDirectorEvents() : [];

  return (
    <EventsFrame
      kicker="Academy staff"
      title="Director"
      lede="Add events, update the poster and cost, and see which families registered."
    >
      <EventDirector
        initialAuthed={authed}
        initialOpenLocally={authed && !eventsDirectorSecret()}
        initialNeedsSetup={!authed && eventsDirectorAuthRequired() && !eventsDirectorSecret()}
        initialEvents={events}
      />
    </EventsFrame>
  );
}
