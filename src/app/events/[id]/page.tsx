import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventPoster } from "@/components/EventPoster";
import { EventRegisterForm } from "@/components/EventRegisterForm";
import { EventsFrame } from "@/components/EventsFrame";
import { pageShare, siteConfig } from "@/lib/config";
import { getPublicEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) {
    return pageShare({
      title: "Event · Steamoji Kirkland",
      description: "Events at Steamoji Kirkland.",
      path: "/events",
    });
  }
  return pageShare({
    title: `${event.title} · Steamoji Kirkland`,
    description: event.description.slice(0, 180),
    path: `/events/${event.id}`,
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) notFound();

  return (
    <EventsFrame kicker="Kirkland academy" title={event.title} lede={event.dateLabel}>
      <p className="events-back">
        <Link href="/events">All events</Link>
      </p>
      <article className="event-detail">
        <EventPoster src={event.posterUrl} alt={`${event.title} poster`} />
        <div className="event-detail-copy">
          <div className="event-card-top">
            <p className="event-cost">{event.costLabel}</p>
            {event.past ? <p className="event-closed">Registration closed</p> : null}
            {event.soldOut && !event.past ? <p className="event-soldout">Sold out</p> : null}
          </div>
          <p className="event-when">
            <span>{event.dateLabel}</span>
            <span>{event.timeLabel}</span>
          </p>
          {event.capacity != null ? (
            <p className="event-spots">
              {event.spotsTaken} of {event.capacity} spots filled
            </p>
          ) : null}
          <p className="event-location">{siteConfig.address}</p>
          <p className="event-full">{event.description}</p>
          {event.past ? (
            <p className="event-closed-note">
              This event has passed, so registration is closed.
            </p>
          ) : event.soldOut ? (
            <p className="event-closed-note">This event is sold out.</p>
          ) : (
            <EventRegisterForm
              eventId={event.id}
              title={event.title}
              allowChildren={event.allowChildren}
            />
          )}
        </div>
      </article>
    </EventsFrame>
  );
}
