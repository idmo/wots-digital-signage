import { NextRequest, NextResponse } from "next/server";
import { resolveSequence } from "@/lib/resolve";

export async function GET(_request: NextRequest, ctx: RouteContext<"/api/sequences/[id]/resolve">) {
  const { id } = await ctx.params;
  const items = await resolveSequence(id);
  return NextResponse.json({ items });
}
