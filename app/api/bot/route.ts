import type { NextRequest } from "next/server";

  export const runtime = "nodejs";
  export const dynamic = "force-dynamic";

  const KEY = process.env.GEMINI_API_KEY;
  const MODEL = "gemini-3.1-flash-lite";

  export async function POST(request: NextRequest) {
    if (!KEY) return Response.json({ error: "bot disabled" }, { status: 503 });
    let locText = "";
    let body: unknown;
    try { body = await request.json(); } catch { return Response.json({ error: "bad body" }, { status: 400 }); }

    const { messages, location } = (body ?? {}) as { messages?: { role: string; text: string }[]; location?: { lat: number; lng: number } };
    if (!Array.isArray(messages) || messages.length === 0) {
      return Response.json({ error: "no messages" }, { status: 400 });
    }

    if (location && typeof location.lat === "number" && typeof location.lng === "number") {
          locText = ` You are located near latitude ${location.lat.toFixed(2)}, longitude ${location.lng.toFixed(2)}. Use your knowledge of that region to chat in a locally-aware, friendly way — mention the area, local vibe, or
      nearby places when it fits naturally.`;
        }
        const systemText =
          "You are Pulse AI, a warm, curious companion on a globe of anonymous strangers. Keep replies short and friendly (1–3 sentences). You are an AI — be upfront if asked." +
          locText;
          
    const contents = messages.slice(-12).map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: String(m.text ?? "").slice(0, 1000) }],
    }));

    // Gemini requires the first message to be from the user — drop the leading
    // bot greeting (and any leading model turns)
    while (contents.length > 0 && contents[0].role !== "user") contents.shift();
    if (contents.length === 0) {
      return Response.json({ error: "no messages" }, { status: 400 });
    }

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents,
            systemInstruction: { parts: [{ text: systemText }] },
            generationConfig: { maxOutputTokens: 220, temperature: 0.9 },
          }),
        },
      );
       if (!res.ok) {
          console.error("Gemini error:", res.status, await res.text());
          return Response.json({ error: "ai error" }, { status: 502 });
        }
        const data = await res.json();
        const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "…";
        return Response.json({ reply });
      } catch (e) {
        console.error("Gemini fetch threw:", e);
        return Response.json({ error: "ai error" }, { status: 502 });
      }

    }