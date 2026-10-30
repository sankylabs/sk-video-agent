import { buildCalendarInviteTest } from "./event-calendar";
import { getPublicEvent } from "./events";

const EVENT_ID = "w-cj4EJWk7";

export async function calendarInviteTestFile() {
  const event = await getPublicEvent(EVENT_ID);
  if (!event) return null;
  return buildCalendarInviteTest(event);
}
