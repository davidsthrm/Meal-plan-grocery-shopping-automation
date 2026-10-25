import type { MetadataRoute } from "next";

/**
 * What a phone needs to put the app on its home screen: name, icons, colours, and that it
 * opens without the browser's bars. The icons come from the logo (`npm run icons:build`).
 * The colours are the paper of the app (`--color-paper`).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Essensplan",
    short_name: "Essensplan",
    description: "Wochenplan und Einkaufszettel für unseren Haushalt",
    lang: "de",
    // Straight to the plan: "/" only redirects there, a request more on every start.
    start_url: "/woche",
    scope: "/",
    display: "standalone",
    // Installed on a phone, the app stays upright (Android; an iPhone asks to be turned back,
    // `TurnUpright`).
    orientation: "portrait",
    background_color: "#f7f4ee",
    theme_color: "#f7f4ee",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      {
        name: "Einkaufszettel",
        url: "/einkauf",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
