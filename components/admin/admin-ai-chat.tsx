"use client";

import { useRef, useState } from "react";
import {
  Bot, Send, Loader2, User, RefreshCw, Sparkles, ShieldAlert, Shield,
} from "lucide-react";
import type { Content } from "@google/generative-ai";
import { useSoundManager } from "@/lib/sound-manager";

interface AiMessage {
  role: "user" | "model";
  text: string;
  actions?: Array<{ fn: string; result: Record<string, unknown> }>;
}

type AiContext = "mod" | "admin";

const ADMIN_STARTERS = [
  "Formuliere eine Patch Note für Version 1.5.0 mit Inhalt: KI-Assistent wurde hinzugefügt, Global Chat eingebaut",
  "Suche den Spieler 'Max' und zeig mir seine Infos.",
  "Welche Moderations-Aktionen kann ich hier ausführen?",
  "Formuliere einen professionellen Verwarnungstext für Spam im Chat.",
  "Schreib eine Community-Ankündigung für ein Doppel-Credits-Event.",
];

const MOD_STARTERS = [
  "Ich möchte einen Spieler verwarnen — wie geht das?",
  "Suche den Spieler 'TestUser' und zeig mir seine Infos.",
  "Formuliere einen Verwarnungstext für unangemessenes Verhalten.",
  "Schreib eine professionelle Antwort auf ein Support-Ticket zu einem Bug.",
];

interface AdminAiChatProps {
  context: AiContext;
}

export function AdminAiChat({ context }: AdminAiChatProps) {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sound = useSoundManager();

  const starters = context === "admin" ? ADMIN_STARTERS : MOD_STARTERS;

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  function buildHistory(): Content[] {
    return messages.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));
  }

  async function sendMessage(text: string) {
    if (!text.trim() || pending) return;
    setError(null);
    setInput("");
    sound.click();

    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const userMsg: AiMessage = { role: "user", text: text.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setPending(true);
    scrollToBottom();

    try {
      const history = buildHistory();
      const res = await fetch("/api/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text.trim(), history, context }),
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
      scrollToBottom();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }

  const ContextIcon = context === "admin" ? ShieldAlert : Shield;
  const contextColor = context === "admin" ? "text-amber-300" : "text-sky-300";
  const contextBg = context === "admin" ? "bg-amber-500/10 border-amber-500/20" : "bg-sky-500/10 border-sky-500/20";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className={`flex items-center gap-2.5 rounded-xl border px-4 py-2.5 mb-4 ${contextBg}`}>
        <ContextIcon className={`h-4 w-4 ${contextColor}`} />
        <div>
          <p className={`text-xs font-bold ${contextColor}`}>
            {context === "admin" ? "Admin-Assistent" : "Moderator-Assistent"}
          </p>
          <p className="text-[10px] text-zinc-500">
            {context === "admin"
              ? "Voller Zugriff: Moderation, Credits, Patch Notes, Textgenerierung"
              : "Moderation, Ticket-Management, Textgenerierung"}
          </p>
        </div>
        <button
          onClick={() => { setMessages([]); setError(null); }}
          className="ml-auto rounded p-1.5 text-zinc-500 hover:text-zinc-300"
          title="Chat zurücksetzen"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
                <Sparkles className="h-4 w-4 text-purple-400" />
              </div>
              <div className="rounded-xl rounded-tl-none bg-purple-500/10 border border-purple-500/20 px-4 py-3 text-sm leading-relaxed text-zinc-200 max-w-[85%]">
                Hey! Ich bin dein {context === "admin" ? "Admin" : "Mod"}-Assistent. Ich kann dir helfen bei:
                <ul className="mt-2 space-y-1 text-xs text-zinc-400">
                  <li>• Spieler suchen, verwarnen, sperren</li>
                  {context === "admin" && <li>• Credits vergeben / abziehen</li>}
                  <li>• Support-Tickets schließen</li>
                  <li>• Patch Notes formulieren</li>
                  <li>• Texte schreiben & verbessern</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-2 pl-10">
              <p className="text-[10px] text-zinc-600 uppercase tracking-wider font-bold">Schnell-Aktionen:</p>
              {starters.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => sendMessage(prompt)}
                  className="rounded-lg border border-white/10 px-3 py-2 text-left text-xs text-zinc-400 hover:border-purple-400/40 hover:bg-purple-500/5 hover:text-zinc-200 transition-colors"
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
            <div key={i} className={`flex items-start gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${isUser ? "bg-zinc-700" : "bg-purple-500/20"}`}>
                {isUser
                  ? <User className="h-3.5 w-3.5 text-zinc-300" />
                  : <Bot className="h-3.5 w-3.5 text-purple-400" />}
              </div>
              <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                isUser
                  ? "rounded-tr-none bg-white/[0.07] text-zinc-200"
                  : "rounded-tl-none bg-purple-500/10 border border-purple-500/20 text-zinc-200"
              }`}>
                <FormattedText text={msg.text} />
                {msg.actions && msg.actions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {msg.actions.map((a, ai) => (
                      <span
                        key={ai}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
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
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-500/20">
              <Bot className="h-3.5 w-3.5 text-purple-400" />
            </div>
            <div className="rounded-xl rounded-tl-none bg-purple-500/10 border border-purple-500/20 px-4 py-3">
              <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="mt-4 border-t border-white/10 pt-4 shrink-0">
        <div className="flex gap-3 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            disabled={pending}
            maxLength={4000}
            rows={2}
            placeholder="Frage oder Aufgabe… (Enter zum Senden, Shift+Enter = neue Zeile)"
            className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-purple-400/60 disabled:opacity-50"
            style={{ height: "auto" }}
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={pending || !input.trim()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1.5 text-[10px] text-zinc-600">Enter = Senden · Shift+Enter = neue Zeile</p>
      </div>
    </div>
  );
}

function FormattedText({ text }: { text: string }) {
  const lines = text.split("\n");
  return (
    <>
      {lines.map((line, li) => {
        if (line.startsWith("### ")) {
          return <h4 key={li} className="font-bold text-zinc-100 mt-2 mb-0.5 text-sm">{line.slice(4)}</h4>;
        }
        if (line.startsWith("## ")) {
          return <h3 key={li} className="font-bold text-zinc-100 mt-3 mb-1">{line.slice(3)}</h3>;
        }
        if (line.startsWith("```")) {
          return null;
        }
        // Bold text
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p key={li} className={li > 0 ? "mt-0.5" : ""}>
            {parts.map((part, pi) =>
              part.startsWith("**") && part.endsWith("**")
                ? <strong key={pi} className="font-bold text-zinc-100">{part.slice(2, -2)}</strong>
                : <span key={pi}>{part}</span>
            )}
          </p>
        );
      })}
    </>
  );
}

function fnLabel(fn: string): string {
  const labels: Record<string, string> = {
    update_player_setting: "Einstellung",
    update_notification_pref: "Benachrichtigung",
    get_player_settings: "Einstellungen gelesen",
    find_user: "User gefunden",
    warn_user: "Verwarnung erteilt",
    temp_ban_user: "Temp-Ban",
    lift_ban: "Ban aufgehoben",
    close_ticket: "Ticket geschlossen",
    add_credits: "Credits geändert",
  };
  return labels[fn] ?? fn;
}
