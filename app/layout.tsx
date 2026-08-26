import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { RegisterSW } from "@/components/RegisterSW";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Sales AI",
  description: "Contesto commerciale delle offerte Siderio, in un unico posto.",
  applicationName: "Sales AI",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sales AI",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#111111",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body className={inter.variable} style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
