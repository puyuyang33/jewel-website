import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veyra Atelier",
    short_name: "Veyra",
    description:
      "Private jewelry design consultation and commission management.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f2ea",
    theme_color: "#7f2736",
    icons: [],
  };
}
