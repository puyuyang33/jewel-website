import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

import styles from "./marketing.module.css";

export function CallToAction({
  eyebrow = "Begin a commission",
  title = "Bring the story. We’ll find its form.",
  description = "Start with a memory, a material, or simply the feeling the piece should hold.",
}: {
  eyebrow?: string;
  title?: string;
  description?: string;
}) {
  return (
    <section className={`${styles.inkPanel} text-porcelain`}>
      <div className="page-shell grid gap-10 py-20 lg:grid-cols-[1fr_auto] lg:items-end lg:py-28">
        <div className="max-w-4xl">
          <p className="text-parchment text-xs font-bold tracking-[0.18em] uppercase">
            {eyebrow}
          </p>
          <h2 className="font-display mt-5 max-w-3xl text-5xl leading-[0.96] tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
            {title}
          </h2>
          <p className="text-porcelain/75 mt-6 max-w-xl text-lg leading-8">
            {description}
          </p>
        </div>
        <Button
          asChild
          size="lg"
          className="bg-porcelain text-ink hover:bg-parchment focus-visible:outline-porcelain"
        >
          <Link href="/start">
            Start your design <ArrowUpRight aria-hidden="true" size={18} />
          </Link>
        </Button>
      </div>
    </section>
  );
}
