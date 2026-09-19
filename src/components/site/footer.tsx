import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { brand } from "@/config/brand";

const footerLinks = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/process", label: "Our process" },
  { href: "/about", label: "The designer" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/payment-cancellation", label: "Payments & cancellation" },
];

export function SiteFooter() {
  return (
    <footer className="border-porcelain/12 bg-ink text-porcelain border-t">
      <div className="page-shell grid gap-12 py-16 lg:grid-cols-[1.2fr_1fr]">
        <div className="max-w-md">
          <Logo className="text-porcelain" />
          <p className="font-display text-parchment mt-7 text-3xl leading-tight">
            Jewelry imagined around your story.
          </p>
          <p className="text-porcelain/65 mt-5 text-sm leading-6">
            A private digital design service for meaningful, one-of-one jewelry
            concepts.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
          {footerLinks.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-porcelain/70 focus-visible:outline-parchment rounded-sm transition hover:text-white focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="border-porcelain/10 border-t">
        <div className="page-shell text-porcelain/55 flex flex-col gap-2 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
          <p>
            &copy; {new Date().getFullYear()} {brand.name}. Fictional
            development brand.
          </p>
          <p>Private consultations. Thoughtful design. Clear provenance.</p>
        </div>
      </div>
    </footer>
  );
}
