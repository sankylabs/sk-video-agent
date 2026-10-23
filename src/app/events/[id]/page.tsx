import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EventRegisterForm } from "@/components/EventRegisterForm";
import { EventsFrame } from "@/components/EventsFrame";
import { siteConfig } from "@/lib/config";
import { getPublicEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) return { title: "Event · Steamoji Kirkland" };
  return {
    title: `${event.title} · Steamoji Kirkland`,
    description: event.description.slice(0, 180),
  };
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
        <div className="event-poster event-poster-frame">
          <Image
            src={event.posterUrl}
            alt={`${event.title} poster`}
            fill
            sizes="(max-width: 800px) 100vw, 380px"
            priority
            unoptimized
          />
        </div>
        <div className="event-detail-copy">
          <div className="event-card-top">
            <p className="event-cost">{event.costLabel}</p>
            {event.past ? <p className="event-closed">Registration closed</p> : null}
          </div>
          <p className="event-when">
            <span>{event.dateLabel}</span>
            <span>{event.timeLabel}</span>
          </p>
          <p className="event-location">{siteConfig.address}</p>
          <p className="event-full">{event.description}</p>
          {event.past ? (
            <p className="event-closed-note">
              This event has passed, so registration is closed.
            </p>
          ) : (
            <EventRegisterForm eventId={event.id} title={event.title} />
          )}
        </div>
      </article>
    </EventsFrame>
  );
}
