import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: `${process.env.STUDIO_NAME || "Feelgood"} · Terminbuchung`,
  description: "Massage, Yoga & Pilates online buchen.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { themeColor: "#33604E", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Marcellus&family=Karla:ital,wght@0,400;0,500;0,700;1,400&display=swap" />
        <link rel="apple-touch-icon" href="/icon.svg" />
      </head>
      <body>{children}</body>
    </html>
  );
}
