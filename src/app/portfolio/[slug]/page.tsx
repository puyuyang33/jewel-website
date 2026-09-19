import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";

import { CallToAction } from "@/components/marketing/call-to-action";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { PageHero } from "@/components/marketing/page-hero";
import { PortfolioVisual } from "@/components/marketing/portfolio-visual";
import {
  getPublicPortfolioContent,
  type PublicContentResult,
  type PublicPortfolioContent,
} from "@/components/marketing/public-content";
import { PublicContentError } from "@/components/marketing/public-content-state";
import { createPortfolioProjectMetadata } from "@/components/marketing/public-seo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface PortfolioDetailProps {
  readonly params: Promise<{ slug: string }>;
}

export const revalidate = 300;

function projectForSlug(
  result: PublicContentResult<PublicPortfolioContent>,
  slug: string,
) {
  return result.ok
    ? result.data.projects.find((project) => project.slug === slug)
    : undefined;
}

export async function generateStaticParams() {
  const result = await getPublicPortfolioContent();
  return result.ok
    ? result.data.projects.map((project) => ({ slug: project.slug }))
    : [];
}

export async function generateMetadata({
  params,
}: PortfolioDetailProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await getPublicPortfolioContent();
  if (!result.ok) {
    return {
      title: "Portfolio unavailable",
      robots: { index: false, follow: true },
    };
  }
  const project = projectForSlug(result, slug);
  if (!project) {
    return {
      title: "Project not found",
      robots: { index: false, follow: false },
    };
  }
  return createPortfolioProjectMetadata(project);
}

export default async function PortfolioDetailPage({
  params,
}: PortfolioDetailProps) {
  const { slug } = await params;
  const result = await getPublicPortfolioContent();

  if (!result.ok) {
    return (
      <MarketingShell>
        <PageHero
          eyebrow="Portfolio / unavailable"
          title="The archive is temporarily out of reach."
          description="The configured public content source did not answer successfully. No local project was substituted."
        />
        <section className="page-shell section-space">
          <PublicContentError message={result.message} />
        </section>
      </MarketingShell>
    );
  }

  const project = projectForSlug(result, slug);
  if (!project) {
    notFound();
  }

  return (
    <MarketingShell>
      <PageHero
        eyebrow={`Portfolio / ${project.category}`}
        title={project.title}
        description={project.excerpt}
        aside={
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between gap-5">
              <dt className="text-stone">Completed</dt>
              <dd>{project.year}</dd>
            </div>
            <div className="flex justify-between gap-5">
              <dt className="text-stone">Archive order</dt>
              <dd>{String(project.sortOrder).padStart(2, "0")}</dd>
            </div>
            <div className="flex justify-between gap-5">
              <dt className="text-stone">Source</dt>
              <dd>
                {result.data.source === "database"
                  ? "Published record"
                  : "Development fixture"}
              </dd>
            </div>
          </dl>
        }
      />

      <article className="section-space">
        <div className="page-shell">
          <Link
            href="/portfolio"
            className="text-garnet focus-visible:outline-garnet inline-flex items-center gap-2 rounded-sm text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-4"
          >
            <ArrowLeft aria-hidden="true" size={16} />
            Back to the archive
          </Link>

          {result.data.source === "development-fallback" ? (
            <p className="border-brass/40 text-stone mt-8 max-w-3xl border-l pl-4 text-sm leading-6">
              Development fallback: this original fictional study is shown only
              because Supabase is not configured.
            </p>
          ) : null}

          <div className="mt-12 grid items-start gap-14 lg:grid-cols-[0.82fr_1fr] lg:gap-24">
            <PortfolioVisual
              project={project}
              mode="detail"
              className="mx-auto w-full max-w-xl"
            />
            <div>
              <p className="eyebrow">Concept note</p>
              <h2 className="font-display mt-3 text-4xl">The design story</h2>
              <div className="text-stone mt-6 space-y-5 text-lg leading-8">
                {project.story.split(/\n{2,}/u).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>

              <div className="border-ink/15 mt-12 grid gap-9 border-t pt-8 sm:grid-cols-2">
                <section aria-labelledby="materials-heading">
                  <h2 id="materials-heading" className="font-display text-2xl">
                    Materials
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.materials.length > 0 ? (
                      project.materials.map((material) => (
                        <Badge key={material}>{material}</Badge>
                      ))
                    ) : (
                      <p className="text-stone text-sm">To be confirmed</p>
                    )}
                  </div>
                </section>
                <section aria-labelledby="techniques-heading">
                  <h2 id="techniques-heading" className="font-display text-2xl">
                    Techniques
                  </h2>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {project.techniques.length > 0 ? (
                      project.techniques.map((technique) => (
                        <Badge key={technique}>{technique}</Badge>
                      ))
                    ) : (
                      <p className="text-stone text-sm">To be confirmed</p>
                    )}
                  </div>
                </section>
              </div>

              <Button asChild variant="secondary" className="mt-10">
                <Link href="/start">
                  Begin your own brief
                  <ArrowUpRight aria-hidden="true" size={16} />
                </Link>
              </Button>
            </div>
          </div>

          {project.media.length > 1 ? (
            <section className="mt-20" aria-labelledby="project-gallery">
              <div className="flex items-end justify-between gap-6">
                <div>
                  <p className="eyebrow">Published media</p>
                  <h2
                    id="project-gallery"
                    className="font-display mt-3 text-4xl"
                  >
                    Further views.
                  </h2>
                </div>
                <p className="text-stone text-sm">
                  {project.media.length - 1} additional{" "}
                  {project.media.length === 2 ? "image" : "images"}
                </p>
              </div>
              <div className="mt-10 grid gap-6 sm:grid-cols-2">
                {project.media.slice(1).map((media) => (
                  <figure
                    key={media.id}
                    className="bg-parchment overflow-hidden rounded-[1.5rem]"
                  >
                    <Image
                      unoptimized
                      src={media.url}
                      alt={media.altText}
                      width={media.width}
                      height={media.height}
                      sizes="(max-width: 640px) 100vw, 50vw"
                      className="h-auto w-full"
                    />
                  </figure>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </article>

      <CallToAction
        eyebrow="A study of your own"
        title="The archive shows a method, never a menu."
        description="Begin with your own context and let the next form emerge from it."
      />
    </MarketingShell>
  );
}
