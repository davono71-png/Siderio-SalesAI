import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Sales AI",
    short_name: "Sales AI",
    description: "Contesto commerciale delle offerte Siderio, in un unico posto.",
    start_url: "/oggi",
    scope: "/",
    display: "standalone",
    background_color: "#f5f5f3",
    theme_color: "#111111",
    lang: "it",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
