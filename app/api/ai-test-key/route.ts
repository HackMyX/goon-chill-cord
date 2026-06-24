import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdmin } from "@/lib/admin";
import { getAiApiKey, getAiConfigStatus } from "@/lib/actions/ai-config";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht eingeloggt." }, { status: 401 });

    const adminDb = createAdminClient();
    const { data: profile } = await adminDb.from("profiles").select("role").eq("id", user.id).single();
    if (!isAdmin(profile)) return NextResponse.json({ error: "Nur Admins." }, { status: 403 });

    const [apiKey, status] = await Promise.all([getAiApiKey(), getAiConfigStatus()]);

    if (!apiKey) {
      return NextResponse.json({
        ok: false,
        source: status.source,
        maskedKey: status.maskedKey,
        error: "Kein API-Schlüssel konfiguriert.",
        rawError: null,
      });
    }

    // Minimal test: list models or send a one-token message
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const result = await model.generateContent("Antworte mit genau einem Wort: OK");
      const text = result.response.text().trim().slice(0, 50);
      return NextResponse.json({
        ok: true,
        source: status.source,
        maskedKey: status.maskedKey,
        model: "gemini-2.0-flash",
        reply: text,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      return NextResponse.json({
        ok: false,
        source: status.source,
        maskedKey: status.maskedKey,
        error: "Gemini-Fehler — siehe rawError für Details.",
        rawError: raw,
      });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
