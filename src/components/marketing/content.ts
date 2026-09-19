export type PortfolioCategory =
  | "Rings"
  | "Necklaces"
  | "Earrings"
  | "Ceremonial"
  | "Objects"
  | "Uncategorized";

export type ArtworkVariant =
  "orbit" | "pendant" | "twin" | "arc" | "signet" | "relic";

export interface PortfolioMedia {
  readonly id: string;
  readonly url: string;
  readonly altText: string;
  readonly width: number;
  readonly height: number;
  readonly sortOrder: number;
}

export interface PortfolioProject {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly category: PortfolioCategory;
  readonly excerpt: string;
  readonly story: string;
  readonly materials: readonly string[];
  readonly techniques: readonly string[];
  readonly featured: boolean;
  readonly sortOrder: number;
  readonly completedOn: string | null;
  readonly publishedAt: string;
  readonly updatedAt: string;
  readonly year: string;
  readonly artwork: ArtworkVariant;
  readonly media: readonly PortfolioMedia[];
}

// These original editorial fixtures are used only when Supabase has no public configuration.
const publicPortfolioFixtures = [
  {
    id: "orrery-no-3",
    slug: "orrery-no-3",
    title: "Orrery No. 3",
    category: "Rings",
    excerpt:
      "An orbit-set ring drawn low to the hand, balancing movement with an assured, tactile profile.",
    story:
      "Orrery No. 3 began with the idea of two lives maintaining their own momentum while sharing one center. The low crossing arcs keep the composition active without lifting the stone away from daily wear.",
    materials: ["Recycled 18k yellow gold", "Champagne sapphire"],
    techniques: ["Low-profile setting", "Hand-finished orbit"],
    featured: true,
    sortOrder: 10,
    completedOn: "2026-06-14",
    publishedAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T00:00:00.000Z",
    year: "2026",
    artwork: "orbit",
    media: [],
  },
  {
    id: "house-light",
    slug: "house-light",
    title: "House Light",
    category: "Necklaces",
    excerpt:
      "A hinged pendant that opens like a small architectural threshold around a quiet green stone.",
    story:
      "House Light translates the remembered shape of a childhood doorway into a pendant with a concealed hinge. Its tourmaline sits slightly within the frame, as though seen from the next room.",
    materials: ["18k green gold", "Green tourmaline"],
    techniques: ["Hinged construction", "Recessed setting"],
    featured: true,
    sortOrder: 20,
    completedOn: "2026-03-09",
    publishedAt: "2026-03-16T00:00:00.000Z",
    updatedAt: "2026-03-16T00:00:00.000Z",
    year: "2026",
    artwork: "pendant",
    media: [],
  },
  {
    id: "afterimage",
    slug: "afterimage",
    title: "Afterimage",
    category: "Earrings",
    excerpt:
      "Mismatched drops with a repeated line, designed to read as one gesture in motion.",
    story:
      "Afterimage considers a pair as a sequence rather than a mirror. Each earring carries the same garnet-red interval at a different height, completing the composition only when worn together.",
    materials: ["Recycled platinum", "Garnet pair"],
    techniques: ["Articulated drops", "Knife-edge wire"],
    featured: true,
    sortOrder: 30,
    completedOn: "2025-11-02",
    publishedAt: "2025-11-10T00:00:00.000Z",
    updatedAt: "2025-11-10T00:00:00.000Z",
    year: "2025",
    artwork: "twin",
    media: [],
  },
  {
    id: "tide-archive",
    slug: "tide-archive",
    title: "Tide Archive",
    category: "Ceremonial",
    excerpt:
      "A ceremonial band with an offset crest and hand-cut channels recalling a changing shoreline.",
    story:
      "Tide Archive uses an inherited old-cut diamond as a point of orientation rather than symmetry. Fine channels travel around the band like dated waterlines on harbor stone.",
    materials: ["Palladium white gold", "Old-cut diamond"],
    techniques: ["Hand-cut channels", "Offset setting"],
    featured: false,
    sortOrder: 40,
    completedOn: "2025-08-18",
    publishedAt: "2025-08-25T00:00:00.000Z",
    updatedAt: "2025-08-25T00:00:00.000Z",
    year: "2025",
    artwork: "arc",
    media: [],
  },
  {
    id: "meridian",
    slug: "meridian",
    title: "Meridian",
    category: "Objects",
    excerpt:
      "A brooch conceived as a portable drawing: one dark plane crossed by a single warm seam.",
    story:
      "Meridian began as a drawing of a route taken often enough to become instinctive. A single gold inlay interrupts oxidized silver, marking direction without becoming decorative.",
    materials: ["Oxidized silver", "18k yellow gold"],
    techniques: ["Gold inlay", "Hand oxidation"],
    featured: false,
    sortOrder: 50,
    completedOn: "2025-05-07",
    publishedAt: "2025-05-14T00:00:00.000Z",
    updatedAt: "2025-05-14T00:00:00.000Z",
    year: "2025",
    artwork: "signet",
    media: [],
  },
  {
    id: "kinship",
    slug: "kinship",
    title: "Kinship",
    category: "Rings",
    excerpt:
      "Two distinct settings joined by one continuous edge, preserving difference rather than matching it away.",
    story:
      "Kinship preserves the difference between two inherited sapphires instead of cutting them toward uniformity. Their settings meet through one continuous gold edge, a connection without imitation.",
    materials: ["Heirloom gold", "Two inherited sapphires"],
    techniques: ["Remilled metal", "Individually fitted settings"],
    featured: false,
    sortOrder: 60,
    completedOn: "2024-10-21",
    publishedAt: "2024-10-28T00:00:00.000Z",
    updatedAt: "2024-10-28T00:00:00.000Z",
    year: "2024",
    artwork: "relic",
    media: [],
  },
] as const satisfies readonly PortfolioProject[];

export function getPublicPortfolioProjects(): readonly PortfolioProject[] {
  return publicPortfolioFixtures;
}

export const processSteps = [
  {
    number: "01",
    title: "The first conversation",
    duration: "Week 1",
    description:
      "We begin with context: who the piece is for, how it should feel, when it will be worn, and what must be protected.",
  },
  {
    number: "02",
    title: "The design brief",
    duration: "Week 1–2",
    description:
      "Your references become a concise brief covering form, materials, budget direction, practical needs, and a shared definition of success.",
  },
  {
    number: "03",
    title: "Concept studies",
    duration: "Week 2–4",
    description:
      "You receive a focused set of original directions—not a crowded catalogue—with drawings and written rationale for each.",
  },
  {
    number: "04",
    title: "Refinement",
    duration: "Week 4–6",
    description:
      "One direction is developed through proportion, setting, profile, wearability, and material decisions before approval.",
  },
  {
    number: "05",
    title: "Making handoff",
    duration: "By agreement",
    description:
      "The approved design is documented for production planning. Fabrication, sourcing, insurance, and delivery are quoted separately.",
  },
] as const;

export const commonFaqs = [
  {
    question: "Is Veyra Atelier a jeweler or a design studio?",
    answer:
      "Veyra is presented as a private jewelry design atelier. The service centers on concept development and design documentation. Fabrication, stone sourcing, valuations, and shipping would be scoped separately with an appropriate maker.",
  },
  {
    question: "What can I commission?",
    answer:
      "Rings, necklaces, earrings, ceremonial pieces, and small jewelry objects are all within scope. The strongest briefs begin with a person, memory, material, or ritual rather than a request to copy an existing piece.",
  },
  {
    question: "Can you redesign inherited jewelry?",
    answer:
      "Yes, as a design study. Existing stones and metal can shape the brief, subject to an in-person assessment by the eventual fabricator. No reuse or durability promise is made before that assessment.",
  },
  {
    question: "How long does a commission take?",
    answer:
      "A considered concept and refinement phase is typically framed as four to six weeks. Production timing depends on complexity, materials, maker availability, and required hallmarking or inspection.",
  },
  {
    question: "Do you publish every commission?",
    answer:
      "No. Privacy preferences should be agreed at the beginning. A private commission need not become portfolio material, and identifying stories should never be published without permission.",
  },
  {
    question: "Can you work to a fixed budget?",
    answer:
      "A budget range is useful from the first conversation. It guides scale, stone strategy, metal choice, and construction, but a final fabrication cost requires a production quote.",
  },
] as const;

export const fictionalTestimonials = [
  {
    quote:
      "The process gave shape to a story I could feel but could not explain. Every revision made the piece quieter and more ours.",
    attribution: "Mara & Theo",
    project: "Ceremonial ring concept",
  },
  {
    quote:
      "Nothing arrived as a generic option. The drawings made each decision legible, from the profile to the smallest inherited stone.",
    attribution: "Anika R.",
    project: "Heirloom redesign concept",
  },
] as const;
