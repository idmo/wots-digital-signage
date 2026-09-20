// Shared definitions for the drag-and-drop dynamic-block template builder
// (admin/templates) and its player-side renderer (app/player). Kept
// dependency-free (no db/server imports) so it can be imported from both
// client components and server code.

export type DataSourceKind = "wordpress_events" | "wordpress_bulletin_board" | "wordpress_featured_readers";

export type ElementType = "image" | "text" | "html" | "qr";

export type ContentElementDef = {
  key: string;
  label: string;
  type: ElementType;
  /** Short hint shown under the palette chip in the editor. */
  hint?: string;
};

// The content elements offered per data source type — what actually comes
// back from that WordPress REST endpoint (see lib/wordpress.ts), reshaped
// into named, typed pieces a region can hold. Extending resolveElements()
// in lib/resolve.ts is how a new key here gets a real value at render time.
export const CONTENT_ELEMENTS: Record<DataSourceKind, ContentElementDef[]> = {
  wordpress_events: [
    { key: "featured_image", label: "Featured Image", type: "image" },
    { key: "title", label: "Title", type: "text" },
    { key: "date_time", label: "Date & Time", type: "text", hint: "Weekday, date, time range" },
    { key: "excerpt", label: "Excerpt", type: "text", hint: "Plain text, trimmed" },
    { key: "content_html", label: "Description (HTML)", type: "html", hint: "Full description, formatted" },
    { key: "qr_code", label: "QR Code", type: "qr", hint: "Links to the event's page" },
  ],
  wordpress_bulletin_board: [
    { key: "featured_image", label: "Featured Image", type: "image" },
    { key: "title", label: "Title", type: "text" },
    { key: "organization", label: "Organization", type: "text", hint: "Custom field" },
    { key: "content_html", label: "Content (HTML)", type: "html", hint: "Full posting, formatted" },
    { key: "qr_code", label: "QR Code", type: "qr", hint: "Links to the posting's website" },
  ],
  wordpress_featured_readers: [
    { key: "book_cover", label: "Book Cover", type: "image" },
    { key: "book_title", label: "Book Title", type: "text" },
    { key: "book_author", label: "Author", type: "text" },
    { key: "reader_name", label: "Reader Name", type: "text", hint: "Who's recommending it" },
    { key: "reader_photo", label: "Reader Photo", type: "image" },
    { key: "blurb_html", label: "Blurb (HTML)", type: "html", hint: "The reader's write-up, formatted" },
    { key: "qr_code", label: "QR Code", type: "qr", hint: "Links to the book's store page" },
  ],
};

export function contentElementDef(dataSourceKind: DataSourceKind, key: string): ContentElementDef | undefined {
  return CONTENT_ELEMENTS[dataSourceKind]?.find((e) => e.key === key);
}

export const DATA_SOURCE_KINDS = Object.keys(CONTENT_ELEMENTS) as DataSourceKind[];

export function isDataSourceKind(value: string): value is DataSourceKind {
  return value in CONTENT_ELEMENTS;
}

// Three fixed 2x2-ish layouts (PRD: 16:9 canvas, TV-only, no responsive
// breakpoints needed). Each is a CSS Grid with 2 columns/2 rows and named
// grid-template-areas; `regions` lists the area names in a sensible reading
// order for the editor's palette-drop targets.
export const TEMPLATE_LAYOUTS = {
  stack: {
    label: "Top, then 2 columns",
    // Row 1 spans both columns. Row 2 has two columns.
    gridTemplateAreas: `"top top" "bl br"`,
    regions: ["top", "bl", "br"] as const,
  },
  split_left: {
    label: "2 rows left, full right",
    // Column 1 has two rows. Column 2 spans both rows.
    gridTemplateAreas: `"lt right" "lb right"`,
    regions: ["lt", "lb", "right"] as const,
  },
  split_right: {
    label: "Full left, 2 rows right",
    // Column 1 spans both rows. Column 2 has two rows.
    gridTemplateAreas: `"left rt" "left rb"`,
    regions: ["left", "rt", "rb"] as const,
  },
} as const;

export type LayoutId = keyof typeof TEMPLATE_LAYOUTS;

export const LAYOUT_IDS = Object.keys(TEMPLATE_LAYOUTS) as LayoutId[];

export function isLayoutId(value: string): value is LayoutId {
  return value in TEMPLATE_LAYOUTS;
}

/** regionId -> ordered list of content-element keys placed in that region. */
export type TemplateRegions = Record<string, string[]>;

export function emptyRegions(layout: LayoutId): TemplateRegions {
  const regions: TemplateRegions = {};
  for (const r of TEMPLATE_LAYOUTS[layout].regions) regions[r] = [];
  return regions;
}

/** Resolved value for one content element on one item, computed server-side
 * in lib/resolve.ts and consumed by the player's TemplateSlide renderer. */
export type ElementValue = {
  type: ElementType;
  value: string | null;
};
