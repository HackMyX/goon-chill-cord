import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AmbientGlow } from "@/components/layout/ambient-glow";
import { GlobalErrorLogger } from "@/components/debug/global-error-logger";
import { ConfirmDialogProvider } from "@/components/layout/confirm-dialog-provider";
import { PresenceHeartbeat } from "@/components/layout/presence-heartbeat";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Goon'n Chill Cord",
  description: "Die Community-Hub für Goon'n Chill Cord",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="de"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <GlobalErrorLogger />
        <AmbientGlow />
        <PresenceHeartbeat />
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </body>
    </html>
  );
}
