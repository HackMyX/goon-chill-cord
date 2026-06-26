"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Loader2, User, RefreshCw, Sparkles } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";
import { createClient } from "@/lib/supabase/client";

interface AiMessage {
  role: "user" | "model";
  text: string;
  actions?: Array<{ fn: string; result: Record<string, unknown> }>;
}

// History format expected by the /api/ai-chat route (OpenAI-compatible)
type HistoryMessage = { role: "user" | "assistant"; content: string };

const STARTER_PROMPTS = [
  "Was sind Credits und wie verdiene ich sie?",
  "Erkläre mir das Auktionshaus.",
  "Deaktiviere meine Trade-Anfragen.",
  "Was sind Raritäten und wie selten sind sie?",
  "Schalte meine Profil-Sichtbarkeit aus.",
];

export function UserAiChat() {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sound = useSoundManager();

  useEffect(() => {
    const sb = createClient();
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      sb.from("profiles").select("avatar_url").eq("id", user.id).single()
        .then(({ data }) => { if (data?.avatar_url) setMyAvatar(data.avatar_url as string); });
    });
  }, []);

  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  useEffect(() => { scrollToBottom(); }, [messages]);

  function buildHistory(): HistoryMessage[] {
    return messages.map((m) => ({
      role: m.role === "model" ? "assistant" : "user",
      content: m.text,
    }));
  }

  async function sendMessage(text: string) {
    if (!text.trim() || pending) return;
    setError(null);
    setInput("");
    sound.click();

    const userMsg: AiMessage = { role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setPending(true);

    try {
      const history = buildHistory();
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history, context: "user" }),
      });
      const data = await res.json() as { reply?: string; error?: string; actionLog?: AiMessage["actions"] };

      if (data.error) {
        setError(data.error);
        sound.error();
      } else {
        sound.click();
        setMessages((prev) => [...prev, {
          role: "model",
          text: data.reply ?? "",
          actions: data.actionLog,
        }]);
      }
    } catch {
      setError("Verbindungsfehler. Bitte versuche es erneut.");
      sound.error();
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5 shrink-0">
        <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20">
          <Sparkles className="h-3 w-3 text-purple-400" />
        </div>
        <span className="text-xs font-bold text-zinc-300">KI-Assistent</span>
        <button
          onClick={() => { setMessages([]); setError(null); }}
          className="ml-auto rounded p-1 text-zinc-500 hover:text-zinc-300"
          title="Chat zurücksetzen"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto chat-scroll px-3 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                <Bot className="h-3.5 w-3.5 text-purple-400" />
              </div>
              <div className="rounded-xl rounded-tl-none bg-purple-500/10 border border-purple-500/20 px-3 py-2.5 text-xs leading-relaxed text-zinc-200">
                Hey! Ich bin der KI-Assistent von <span className="font-bold text-purple-300">Goon&apos;n Chill Cord</span>.
                Ich kann dir bei Fragen zur Seite helfen und auch Einstellungen für dich ändern.
              </div>
            </div>
            <div className="flex flex-col gap-1.5 pl-8">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Schnell-Fragen:</p>
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-left text-[11px] text-zinc-400 hover:border-purple-400/40 hover:bg-purple-500/5 hover:text-zinc-200 transition-colors"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.role === "user";
          return (
            <div key={i} className={`chat-msg-enter flex items-start gap-2.5 ${isUser ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full ${isUser ? (myAvatar ? "" : "bg-zinc-700") : "bg-purple-500/20"}`}>
                {isUser ? (
                  myAvatar
                    ? <img src={myAvatar} alt="Du" className="h-full w-full object-cover" />
                    : <User className="h-3.5 w-3.5 text-zinc-300" />
                ) : (
                  <Bot className="h-3.5 w-3.5 text-purple-400" />
                )}
              </div>
              <div className={`max-w-[85%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                isUser
                  ? "rounded-tr-none bg-white/[0.07] text-zinc-200"
                  : "rounded-tl-none bg-purple-500/10 border border-purple-500/20 text-zinc-200"
              }`}>
                <MessageText text={msg.text} />
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {msg.actions.map((a, ai) => (
                      <span
                        key={ai}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold ${
                          (a.result as { success?: boolean }).success
                            ? "bg-emerald-500/20 text-emerald-300"
                            : "bg-red-500/20 text-red-300"
                        }`}
                      >
                        {(a.result as { success?: boolean }).success ? "✓" : "✗"} {fnLabel(a.fn)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {pending && (
          <div className="flex items-start gap-2.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
              <Bot className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="rounded-xl rounded-tl-none bg-purple-500/10 border border-purple-500/20 px-3 py-2.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-2.5 shrink-0">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={pending}
            maxLength={1000}
            placeholder="Frag mich alles über die Seite…"
            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={pending || !input.trim()}
            className="flex items-center justify-center rounded-lg bg-purple-600 px-3 py-2 text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </form>
      </div>
    </div>
  );
}

function MessageText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\n)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return <strong key={i} className="font-bold text-zinc-100">{part.slice(2, -2)}</strong>;
        }
        if (part === "\n") return <br key={i} />;
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function fnLabel(fn: string): string {
  const labels: Record<string, string> = {
    get_my_profile: "Profil abgerufen",
    get_platform_info: "Plattform-Infos",
    get_leaderboard: "Bestenliste",
    get_player_settings: "Einstellungen gelesen",
    update_player_setting: "Einstellung",
    update_notification_pref: "Benachrichtigung",
    find_user: "User gesucht",
    warn_user: "Verwarnt",
    temp_ban_user: "Gebannt",
    lift_ban: "Ban aufgehoben",
    close_ticket: "Ticket geschlossen",
    add_credits: "Credits",
  };
  return labels[fn] ?? fn;
}
