export const brand = {
  name: "Veyra Atelier",
  shortName: "Veyra",
  designerName: "Elena Veyra",
  tagline: "Jewelry imagined around your story.",
  description:
    "A private design atelier for considered, one-of-one jewelry concepts.",
  email: "studio@example.com",
  location: "By appointment, worldwide",
  socialLinks: {
    instagram: "https://www.instagram.com/",
    pinterest: "https://www.pinterest.com/",
  },
  portfolioCategories: [
    "Rings",
    "Necklaces",
    "Earrings",
    "Ceremonial",
    "Objects",
  ],
} as const;

export const seo = {
  titleTemplate: "%s | Veyra Atelier",
  defaultTitle: "Veyra Atelier | Private Jewelry Design",
  description: brand.description,
} as const;
