import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getSiteConfig } from "@/lib/actions/site-config";
import { resolveSiteLogoIcon } from "@/lib/site-logo-icons";

export const contentType = "image/svg+xml";
export const dynamic = "force-dynamic";

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
  const iconMarkup = renderToStaticMarkup(
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
