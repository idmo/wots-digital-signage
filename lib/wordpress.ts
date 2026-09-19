// WordPress "The Events Calendar" REST API client (PRD §3.4, §6).
// Shape confirmed against the live site's
// /wp-json/tribe/events/v1/events endpoint.

export type WpEventImageSize = {
  url: string;
  width?: number;
  height?: number;
};

export type WpEvent = {
  id: number;
  title: string;
  description: string;
  excerpt: string;
  url: string;
  start_date: string;
  end_date: string;
  start_date_details: WpDateDetails;
  end_date_details: WpDateDetails;
  all_day?: boolean;
  venue?: { venue?: string } | unknown[];
  image?: {
    url?: string;
    sizes?: Record<string, WpEventImageSize>;
  } | false;
};

type WpDateDetails = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minutes: string;
  seconds: string;
};

export async function fetchWordPressEvents(baseUrl: string, perPage = 20): Promise<WpEvent[]> {
  const url = new URL("/wp-json/tribe/events/v1/events", baseUrl);
  url.searchParams.set("per_page", String(perPage));
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`WordPress events fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.events ?? [];
}

/**
 * Best available image URL for an event. Prefers the original upload
 * (`image.url`) — WordPress's generated sizes top out around 2048px on the
 * long edge and "medium" is only ~300px wide, which looked visibly
 * pixelated stretched across a third or two-thirds of a signage display.
 * Falls back to the largest generated size only if the original is missing.
 */
export function bestEventImageUrl(event: WpEvent): string | null {
  const image = event.image;
  if (!image || typeof image !== "object") return null;
  return (
    image.url ??
    image.sizes?.["2048x2048"]?.url ??
    image.sizes?.["1536x1536"]?.url ??
    image.sizes?.large?.url ??
    image.sizes?.medium_large?.url ??
    image.sizes?.medium?.url ??
    null
  );
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function detailsToDate(d: WpDateDetails): Date {
  return new Date(
    Number(d.year),
    Number(d.month) - 1,
    Number(d.day),
    Number(d.hour),
    Number(d.minutes),
    Number(d.seconds)
  );
}

function formatTime(d: WpDateDetails): string {
  const date = detailsToDate(d);
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12;
  if (hours === 0) hours = 12;
  const minutesStr = minutes === 0 ? "" : `:${String(minutes).padStart(2, "0")}`;
  return `${hours}${minutesStr}${ampm}`;
}

/** Formats an event's day/date/time for display, e.g. "Saturday, September 20 · 2PM–4PM". */
export function formatEventWhen(event: WpEvent): { weekday: string; date: string; timeRange: string } {
  const start = detailsToDate(event.start_date_details);
  const weekday = WEEKDAYS[start.getDay()];
  const date = `${MONTHS[start.getMonth()]} ${start.getDate()}`;

  if (event.all_day) {
    return { weekday, date, timeRange: "All Day" };
  }

  const startTime = formatTime(event.start_date_details);
  const endTime = formatTime(event.end_date_details);
  return { weekday, date, timeRange: `${startTime}–${endTime}` };
}
