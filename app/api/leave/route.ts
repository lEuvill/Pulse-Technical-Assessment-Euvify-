import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifySecret } from "@/lib/session";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/leave — body { id }. Removes the presence row and any pending
// signals to/from this user. Called via navigator.sendBeacon on tab close, so
// the body may arrive as text — parse defensively.
export async function POST(request: NextRequest) {
  let id: string | undefined;
    let secret: string | undefined;
    try {
      const text = await request.text();           // ← restore this
      const parsed = text ? JSON.parse(text) : {};
      id = parsed?.id;
      secret = parsed?.secret;
    } catch {
      id = undefined;
    }

    if (typeof id !== "string" || !id) {
      return Response.json({ error: "invalid id" }, { status: 400 });
    }

    const row = await prisma.presence.findUnique({ where: { id }, select: { secret: true } });
    if (!row || !verifySecret(secret ?? null, row.secret)) {
      return Response.json({ error: "unauthorized" }, { status: 403 });
    }

  // Independent cleanup deletes — no atomicity needed (and interactive
  // transactions are unreliable over a PgBouncer pooler).
  await prisma.signal.deleteMany({
    where: { OR: [{ toId: id }, { fromId: id }] },
  });
  await prisma.presence.deleteMany({ where: { id } });

  return Response.json({ ok: true });
}
