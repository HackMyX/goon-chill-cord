import { createElement, type ReactElement } from "react";
import { getSiteConfig } from "@/lib/actions/site-config";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";

export const contentType = "image/svg+xml";
export const dynamic = "force-dynamic";

/**
 * Converts a React element tree to an SVG string without react-dom/server,
 * which is banned in the App Router metadata-image pipeline in Next.js 15+.
 * Handles forwardRef components (Lucide icons), function components, and
 * host SVG elements. Keeps viewBox intact — the one mixed-case SVG attribute
 * that must not be lowercased.
 */
function svgElementToString(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);

  const el = node as ReactElement<Record<string, unknown>>;
  const { type, props } = el;

  // forwardRef component — Lucide icons are { $$typeof, render } objects
  if (typeof type === "object" && type !== null) {
    const fwd = type as { render?: (p: Record<string, unknown>, r: null) => unknown };
    if (typeof fwd.render === "function") {
      return svgElementToString(fwd.render(props ?? {}, null));
    }
  }

  // Plain function component
  if (typeof type === "function") {
    return svgElementToString((type as (p: Record<string, unknown>) => unknown)(props ?? {}));
  }

  // Host SVG element
  const tag = String(type);
  const { children, ...rest } = props ?? {};

  const attrs = Object.entries(rest)
    .filter(([, v]) => v != null)
    .map(([k, v]) => {
      // viewBox is the only mixed-case SVG attribute we must not hyphenate
      const attr = k === "viewBox" ? "viewBox" : k.replace(/([A-Z])/g, "-$1").toLowerCase();
      return `${attr}="${String(v)}"`;
    })
    .join(" ");

  const childArr: unknown[] = children == null ? [] : Array.isArray(children) ? children : [children];
  const inner = childArr.map(svgElementToString).join("");

  const open = attrs ? `<${tag} ${attrs}>` : `<${tag}>`;

  // Self-close typical void SVG elements when they have no children
  const VOID = new Set(["path", "line", "circle", "rect", "polyline", "polygon", "ellipse", "use", "stop"]);
  if (!inner && VOID.has(tag)) return attrs ? `<${tag} ${attrs}/>` : `<${tag}/>`;

  return `${open}${inner}</${tag}>`;
}

export default async function Icon() {
  const config = await getSiteConfig();

  if (config.logoUrl) {
    const escaped = config.logoUrl
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<rect width="32" height="32" rx="6" fill="#0b0814"/>
<image href="${escaped}" x="2" y="2" width="28" height="28" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
    return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
  }

  const IconComp = resolveSiteLogoIcon(config.logoIconName);
  const iconMarkup = svgElementToString(
    createElement(IconComp, { size: 24, color: "white", strokeWidth: 2.5 } as object)
  );
  const innerStart = iconMarkup.indexOf(">") + 1;
  const innerEnd = iconMarkup.lastIndexOf("</svg>");
  const paths = iconMarkup.slice(innerStart, innerEnd);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#7c3aed"/><stop offset="100%" stop-color="#a855f7"/></linearGradient></defs>
<rect width="32" height="32" rx="6" fill="url(#g)"/>
<svg x="6" y="6" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>
</svg>`;

  return new Response(svg, { headers: { "Content-Type": "image/svg+xml" } });
}
