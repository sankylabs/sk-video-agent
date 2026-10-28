import { EventsBrowser } from "@/components/EventsBrowser";
import { EventsFrame } from "@/components/EventsFrame";
import { pageShare } from "@/lib/config";
import { splitEvents } from "@/lib/event-model";
import { listPublicEvents, syncPendingEventRegistrations } from "@/lib/events";

export const dynamic = "force-dynamic";

const eventsDescription =
  "Upcoming and past events at Steamoji Kirkland. See the date, time, cost, and register your family.";

export const metadata = pageShare({
  title: "Events · Steamoji Kirkland",
  description: eventsDescription,
  path: "/events",
});

export default async function EventsPage() {
  await syncPendingEventRegistrations();
  const { upcoming, past } = splitEvents(await listPublicEvents());

  return (
    <EventsFrame
      kicker="Kirkland academy"
      title="Events"
      lede="Upcoming workshops and family days."
    >
      <EventsBrowser upcoming={upcoming} past={past} />
    </EventsFrame>
  );
}
