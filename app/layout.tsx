import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AmbientGlow } from "@/components/layout/ambient-glow";
import { GlobalErrorLogger } from "@/components/debug/global-error-logger";
import { ThreeWarningsSuppressor } from "@/components/debug/three-warnings-suppressor";
import { ConfirmDialogProvider } from "@/components/layout/confirm-dialog-provider";
import { SiteConfigProvider } from "@/components/layout/site-config-provider";
import { ProfilePopupProvider } from "@/components/ui/profile-popup-provider";
import { PetConfigProvider } from "@/lib/pet-config-context";
import { PresenceHeartbeat } from "@/components/layout/presence-heartbeat";
import { SupportButton } from "@/components/support/ticket-button";
import { FpRegistrar } from "@/components/auth/fp-registrar";
import { getSiteConfig } from "@/lib/actions/site-config";
import { getPetConfigs } from "@/lib/actions/pets";
import { PatchnotePopupLoader } from "@/components/layout/patchnote-popup-loader";
import { GlobalBroadcast } from "@/components/global/global-broadcast";
import { GenderGate } from "@/components/auth/gender-gate";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
  themeColor: "#030305",
  viewportFit: "cover",
};

// `generateMetadata`, not a static `export const metadata` — the browser
// tab title needs to reflect the admin-configured site name (lib/site-
// config.ts), which a static object computed once at module load could
// never pick up.
export async function generateMetadata(): Promise<Metadata> {
  const { siteName } = await getSiteConfig();
  return {
    title: siteName,
    description: `Die Community-Hub für ${siteName}`,
    icons: {
      icon: "/icon",
      shortcut: "/icon",
      apple: "/icon",
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [siteConfig, petConfigs] = await Promise.all([getSiteConfig(), getPetConfigs()]);
  return (
    <html
      lang="de"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThreeWarningsSuppressor />
        <GlobalErrorLogger />
        <AmbientGlow />
        <PresenceHeartbeat />
        <FpRegistrar />
        <SiteConfigProvider config={siteConfig}>
          <PetConfigProvider initialConfigs={petConfigs}>
            <ConfirmDialogProvider>
              <ProfilePopupProvider>{children}</ProfilePopupProvider>
            </ConfirmDialogProvider>
          </PetConfigProvider>
        </SiteConfigProvider>
        <GlobalBroadcast />
        <GenderGate />
        <SupportButton />
        <PatchnotePopupLoader />
      </body>
    </html>
  );
}
