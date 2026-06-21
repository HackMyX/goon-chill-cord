import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Discord avatar CDN — shown in the Community profile popup
    // (components/community/profile-modal.tsx), which reads each player's
    // Discord avatar_url straight from their OAuth identity data.
    remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
  },
};

export default nextConfig;
