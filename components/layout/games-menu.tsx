"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Gamepad2, ChevronDown, Globe, Pickaxe, Joystick } from "lucide-react";
import { useSoundManager } from "@/lib/sound-manager";

const LIVE_GAMES = [
  { icon: Joystick, label: "Snake", href: "/snake" },
  { icon: Pickaxe, label: "Mine", href: "/mine" },
];

/**
 * Only *actual games* belong here — 3D-Welt is real and links straight
 * there; Snake and Mine are upcoming minigames, honestly tagged "Bald"
 * rather than pretending to be clickable. Shop/Auktionshaus/Trading/
 * Community aren't games at all and live as normal top-level icons in
 * TopBar instead.
 *
 * The dropdown panel is portaled to `document.body` and positioned via a
 * measured `getBoundingClientRect()` instead of `position: absolute`
 * inside the button's own wrapper — TopBar's right-side icon row needs
 * `overflow-hidden` to keep dense icon rows from wrapping badly on narrow
 * screens, and that overflow would otherwise clip an absolutely
 * positioned dropdown right out of view (which is exactly why it looked
 * like there was "nothing in Games").
 */
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
        className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
          open
            ? "bg-purple-500/20 text-purple-200"
            : "bg-white/5 text-zinc-300 hover:bg-purple-500/15 hover:text-purple-200"
        }`}
      >
        <Gamepad2 className="h-4 w-4" />
        Games
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {mounted &&
        open &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: coords.top, right: coords.right }}
            className="fixed z-[100] w-56 overflow-hidden rounded-xl border border-white/10 bg-[#0b0814] shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <Link
              href="/world"
              onMouseEnter={sound.hover}
              onClick={() => {
                sound.click();
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-purple-500/10 hover:text-purple-200"
            >
              <Globe className="h-4 w-4 text-zinc-500" />
              3D-Welt
            </Link>

            {LIVE_GAMES.map((entry) => (
              <Link
                key={entry.label}
                href={entry.href}
                onMouseEnter={sound.hover}
                onClick={() => { sound.click(); setOpen(false); }}
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-zinc-300 transition-colors hover:bg-purple-500/10 hover:text-purple-200"
              >
                <entry.icon className="h-4 w-4 text-zinc-500" />
                {entry.label}
              </Link>
            ))}
          </div>,
          document.body
        )}
    </>
  );
}
