import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { STALE_MS, SIGNAL_TTL_MS } from "@/lib/presence";
import type { PollResponse } from "@/lib/types";
import { verifySecret } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/poll?id= — the single endpoint that drives the live map.
// It (1) heartbeats the caller, (2) reaps stale presence + orphan signals,
// (3) returns the filtered online peers, and (4) drains this user's mailbox.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const id = params.get("id");
    if (!id) return Response.json({ error: "missing id" }, { status: 400 });
    const secret = request.headers.get("x-pulse-secret");

    const now = Date.now();
    const staleCutoff = new Date(now - STALE_MS);
    const signalCutoff = new Date(now - SIGNAL_TTL_MS);

    const self = await prisma.presence.findUnique({ where: { id }, select: { secret: true } });
    const inCall = params.get("inCall") === "1";
    const authed = !!self && verifySecret(secret, self.secret);

    if (authed) {
      await prisma.presence.updateMany({
        where: { id },
        data: inCall ? { lastSeen: new Date(now) } : { lastSeen: new Date(now), busy: false },
      });
    }

    await prisma.presence.deleteMany({ where: { lastSeen: { lt: staleCutoff } } });
    await prisma.signal.deleteMany({ where: { createdAt: { lt: signalCutoff } } });

    const peers = await prisma.presence.findMany({
      where: { id: { not: id }, lastSeen: { gte: staleCutoff } },
      select: { id: true, lat: true, lng: true, busy: true },
    });

    let inbox: { id: string; fromId: string; toId: string; type: string; payload: string | null; createdAt: Date }[] = [];
    if (authed) {
      inbox = await prisma.signal.findMany({ where: { toId: id }, orderBy: { createdAt: "asc" } });
      if (inbox.length > 0) {
        await prisma.signal.deleteMany({ where: { id: { in: inbox.map((s) => s.id) } } });
      }
    }

    const response: PollResponse = {
      present: authed,
      peers: peers.map((p) => ({ id: p.id, lat: p.lat, lng: p.lng, busy: p.busy })),
      signals: inbox.map((s) => ({
        id: s.id, fromId: s.fromId, toId: s.toId,
        type: s.type as PollResponse["signals"][number]["type"],
        payload: s.payload, createdAt: s.createdAt.toISOString(),
      })),
    };
    return Response.json(response);
}
