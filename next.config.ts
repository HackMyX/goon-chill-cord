import type { NextConfig } from "next";

// Build-/Deploy-Infos zur BUILD-ZEIT einbacken, damit die laufende App immer
// weiß, welcher Vercel-Deploy sie ist (Commit, Nachricht, Branch, Deploy-URL,
// Build-Zeitpunkt). `new Date()` hier läuft genau einmal beim `next build` →
// ist also der echte Build-/Deploy-Zeitstempel. Vercel liefert die VERCEL_*-
// Variablen automatisch (System-Env-Variablen müssen in den Projekt-Settings
// aktiviert sein — Standard).
const BUILD_TIME = new Date().toISOString();

const nextConfig: NextConfig = {
  images: {
    // Discord avatar CDN — shown in the Community profile popup
    // (components/community/profile-modal.tsx), which reads each player's
    // Discord avatar_url straight from their OAuth identity data.
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
  env: {
    NEXT_PUBLIC_BUILD_TIME: BUILD_TIME,
    NEXT_PUBLIC_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "",
    NEXT_PUBLIC_COMMIT_MESSAGE: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "",
    NEXT_PUBLIC_COMMIT_REF: process.env.VERCEL_GIT_COMMIT_REF ?? "",
    NEXT_PUBLIC_COMMIT_AUTHOR: process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME ?? "",
    NEXT_PUBLIC_DEPLOYMENT_ID: process.env.VERCEL_DEPLOYMENT_ID ?? "",
    NEXT_PUBLIC_DEPLOY_URL: process.env.VERCEL_URL ?? "",
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
};

export default nextConfig;
