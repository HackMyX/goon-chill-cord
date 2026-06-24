import { NextResponse } from "next/server";
import Groq from "groq-sdk";
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

    try {
      const groq = new Groq({ apiKey });
      const response = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "Antworte mit genau einem Wort: OK" }],
        max_tokens: 10,
        temperature: 0,
      });
      const text = response.choices[0]?.message?.content?.trim().slice(0, 50) ?? "OK";
      return NextResponse.json({
        ok: true,
        source: status.source,
        maskedKey: status.maskedKey,
        model: "llama-3.3-70b-versatile",
        reply: text,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      return NextResponse.json({
        ok: false,
        source: status.source,
        maskedKey: status.maskedKey,
        error: "Groq-Fehler — siehe rawError für Details.",
        rawError: raw,
      });
    }
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
