import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/db";
import { eq, desc } from "drizzle-orm";
import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads");

/**
 * Probe a video's duration/dimensions with ffprobe. Returns nulls if
 * ffprobe isn't installed (dev convenience) — required in the Docker
 * image per the Dockerfile.
 */
async function probeVideo(filePath: string) {
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      filePath,
    ]);
    const data = JSON.parse(stdout);
    const stream = data.streams?.[0] ?? {};
    return {
      width: stream.width ?? null,
      height: stream.height ?? null,
      durationSeconds: data.format?.duration ? Math.round(parseFloat(data.format.duration)) : null,
    };
  } catch {
    return { width: null, height: null, durationSeconds: null };
  }
}

export async function GET() {
  const assets = await db.select().from(schema.assets).orderBy(desc(schema.assets.uploadedAt));
  return NextResponse.json(assets);
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file is required (multipart/form-data)" }, { status: 400 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash("sha256").update(bytes).digest("hex");

  // Dedupe by checksum (PRD §13.3 asset-matching logic, reused here for uploads).
  const existing = await db.query.assets.findFirst({ where: eq(schema.assets.checksum, checksum) });
  if (existing) return NextResponse.json(existing, { status: 200 });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(file.name) || "";
  const storedName = `${checksum}${ext}`;
  const filePath = path.join(UPLOAD_DIR, storedName);
  await writeFile(filePath, bytes);

  const isVideo = file.type.startsWith("video/");
  let width: number | null = null;
  let height: number | null = null;
  let durationSeconds: number | null = null;

  if (isVideo) {
    const probed = await probeVideo(filePath);
    width = probed.width;
    height = probed.height;
    durationSeconds = probed.durationSeconds;
  }

  const [asset] = await db
    .insert(schema.assets)
    .values({
      type: isVideo ? "video" : "image",
      filePath: `/uploads/${storedName}`,
      mimeType: file.type,
      width,
      height,
      durationSeconds,
      fileSize: bytes.byteLength,
      checksum,
      source: "upload",
    })
    .returning();

  return NextResponse.json(asset, { status: 201 });
}
