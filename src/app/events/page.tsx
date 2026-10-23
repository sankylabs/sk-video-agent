import type { Metadata } from "next";
import { EventsBrowser } from "@/components/EventsBrowser";
import { EventsFrame } from "@/components/EventsFrame";
import { splitEvents } from "@/lib/event-model";
import { listPublicEvents } from "@/lib/events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Events · Steamoji Kirkland",
  description:
    "Upcoming and past events at Steamoji Kirkland. See the date, time, cost, and register your family.",
};

export default async function EventsPage() {
  const { upcoming, past } = splitEvents(await listPublicEvents());

  return (
    <EventsFrame
      kicker="Kirkland academy"
      title="Events"
      lede="Upcoming workshops and family days. Past events stay here after they’re over."
    >
      <EventsBrowser upcoming={upcoming} past={past} />
    </EventsFrame>
  );
}
