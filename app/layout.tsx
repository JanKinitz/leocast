import type { Metadata, Viewport } from "next";
import "./globals.css";
import MarkerPrefetcher from "@/components/MarkerPrefetcher";
import RegisterSW from "@/components/RegisterSW";
import PlayerProvider from "@/components/PlayerProvider";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Leocast",
  description: "Musik und Podcasts für Kinder",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#14172b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;700;800;900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RegisterSW />
        <MarkerPrefetcher />
        <PlayerProvider>
          <AppShell>{children}</AppShell>
        </PlayerProvider>
      </body>
    </html>
  );
}
