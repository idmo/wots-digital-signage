import { db, schema } from "./index";
import { eq } from "drizzle-orm";

// Seeded categories per PRD §3.5.
const CATEGORIES = [
  { name: "Event", color: "#2563eb", defaultDurationSeconds: 12 },
  { name: "Community Board", color: "#16a34a", defaultDurationSeconds: 10 },
  { name: "Featured Readers", color: "#9333ea", defaultDurationSeconds: 10 },
  { name: "General", color: "#4f46e5", defaultDurationSeconds: 10 },
  { name: "Fun", color: "#ea580c", defaultDurationSeconds: 8 },
];

async function main() {
  for (const category of CATEGORIES) {
    const existing = await db.query.categories.findFirst({
      where: eq(schema.categories.name, category.name),
    });
    if (!existing) {
      await db.insert(schema.categories).values(category);
    }
  }
  console.log(`Seeded ${CATEGORIES.length} categories.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
