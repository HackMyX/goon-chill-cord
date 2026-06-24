"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Gamepad2, ChevronDown, Globe, Pickaxe, Joystick, Coins, Package } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";

const GAMES_ENTRIES = [
  { icon: Package, label: "Cases", href: "/cases", accent: "text-purple-400" },
  { icon: Globe, label: "3D-Welt", href: "/world", accent: "text-emerald-400" },
  { icon: Joystick, label: "Snake", href: "/snake", accent: "text-lime-400" },
  { icon: Pickaxe, label: "Mine", href: "/mine", accent: "text-orange-400" },
  { icon: Coins, label: "Double or Nothing", href: "/don", accent: "text-amber-400" },
];

export function GamesMenu() {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sound = useSoundManager();

  useEffect(() => {
    const timeout = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function toggleOpen() {
    sound.click();
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setCoords({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <button
        ref={buttonRef}
        onMouseEnter={sound.hover}
        onClick={toggleOpen}
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-all ${
          open
            ? "bg-purple-500/20 text-purple-200 shadow-[0_0_12px_rgba(147,51,234,0.2)]"
            : "bg-white/[0.04] text-zinc-300 hover:bg-purple-500/15 hover:text-purple-200"
        }`}
      >
        <Gamepad2 className="h-4 w-4" />
        Games
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: coords.top, right: coords.right }}
            className="fixed z-[100] w-52 overflow-hidden rounded-xl border border-white/10 bg-[#0b0814] shadow-[0_8px_30px_rgba(0,0,0,0.6)]"
          >
            <div className="px-3 py-2 border-b border-white/5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">Spielmodi</p>
            </div>
            {GAMES_ENTRIES.map((entry) => (
              <Link
                key={entry.label}
                href={entry.href}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-purple-500/10 hover:text-purple-200"
              >
                <entry.icon className={`h-4 w-4 shrink-0 ${entry.accent}`} />
                {entry.label}
              </Link>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
