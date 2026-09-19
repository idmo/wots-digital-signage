/**
 * WordPress integration (PRD §6). Phase 1 covers Events only, via
 * The Events Calendar's REST API. Pods/custom-REST sources (Community
 * Board, Featured Readers) are Phase 2 (§6.2–§6.4).
 */

export type WpEvent = {
  id: number;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  url: string;
  venue?: { venue?: string };
  image?: { url?: string };
};

export async function fetchWordPressEvents(baseUrl: string): Promise<WpEvent[]> {
  const url = new URL("/wp-json/tribe/events/v1/events", baseUrl);
  url.searchParams.set("per_page", "20");

  const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
  if (!res.ok) {
    throw new Error(`WordPress events fetch failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  return data.events ?? [];
}
