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

// ---------------------------------------------------------------------------
// Community Bulletin Board — a Pods custom post type (`bulletin_board_item`)
// exposed at the standard WP REST route (not `/wp-json/pods/v1`, which only
// manages Pods' own config). Shape confirmed against the live site's
// /wp-json/wp/v2/bulletin_board_item endpoint.
// ---------------------------------------------------------------------------

export type WpBulletinBoardItem = {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  start_date?: string; // "YYYY-MM-DD"
  end_date?: string; // "YYYY-MM-DD HH:MM:SS"
  website?: string;
  approved?: string | number | boolean;
  featured_media?: number;
  // Pods custom field, REST-exposed directly on the post object under its
  // field name. Adjust this key if the live site exposes it differently
  // (e.g. under `meta`) once the template builder is tested against it.
  organization?: string;
  _embedded?: {
    "wp:featuredmedia"?: Array<{ source_url?: string }>;
  };
};

export async function fetchBulletinBoardItems(baseUrl: string, perPage = 20): Promise<WpBulletinBoardItem[]> {
  const url = new URL("/wp-json/wp/v2/bulletin_board_item", baseUrl);
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("_embed", "1");
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`WordPress bulletin board fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/** The `approved` Pods checkbox field comes back as "1"/"0", 1/0, or a bool
 * depending on how it's serialized — normalize all of those. */
export function isBulletinBoardItemApproved(item: WpBulletinBoardItem): boolean {
  return item.approved === true || item.approved === "1" || item.approved === 1;
}

export function bulletinBoardImageUrl(item: WpBulletinBoardItem): string | null {
  return item._embedded?.["wp:featuredmedia"]?.[0]?.source_url ?? null;
}

/** True if `now` falls within the item's [start_date, end_date] window.
 * Missing/unparseable dates on either side don't exclude the item — only an
 * explicit, parseable out-of-range date does. */
export function isBulletinBoardItemEligible(item: WpBulletinBoardItem, now: Date): boolean {
  if (item.start_date) {
    const start = new Date(item.start_date.replace(" ", "T"));
    if (!Number.isNaN(start.getTime()) && now < start) return false;
  }
  if (item.end_date) {
    const end = new Date(item.end_date.replace(" ", "T"));
    if (!Number.isNaN(end.getTime()) && now > end) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Featured Readers — a small custom REST endpoint on the WordPress side
// (PRD §6.3/§6.4) that joins three things server-side, in PHP, so the
// signage backend gets one clean array back instead of stitching Pods
// relationships + a WooCommerce product lookup together itself:
//   signage_reader (Pods CPT) <- reader relationship - signage_recommendation
//   (Pods CPT) - book relationship -> WooCommerce `product`
// tagged with the signage_feature_period taxonomy (terms slugged "YYYY-MM").
// See docs/featured-readers-endpoint.php for the WordPress-side code this
// client expects, and its header comment for the exact field/slug
// assumptions — adjust either side if Brian's real Pods setup differs.
// ---------------------------------------------------------------------------

export type WpFeaturedReaderEntry = {
  id: number; // the signage_recommendation post ID
  reader: {
    id: number; // the signage_reader post ID — used to group a reader's recommendations together
    name: string;
    photo_url: string | null;
  };
  book: {
    title: string;
    author: string | null;
    cover_url: string | null;
    product_url: string | null;
  };
  blurb: string; // rich-text HTML from the recommendation's blurb field
};

/**
 * `period` is "current" (the default — resolved server-side against
 * WordPress's own clock/timezone so the signage backend never has to
 * compute "this month" itself) or a pinned free-text month/year, e.g.
 * "September 2025" — matched, loosely, against each Reader's own
 * "Featured Month and Year" field (see docs/featured-readers-endpoint.php's
 * signage_parse_month_year).
 */
export async function fetchFeaturedReaders(
  baseUrl: string,
  period: string = "current"
): Promise<WpFeaturedReaderEntry[]> {
  const url = new URL("/wp-json/signage/v1/featured-readers", baseUrl);
  url.searchParams.set("period", period);
  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`WordPress featured readers fetch failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}
