import Link from "next/link";

import { Logo } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import { MobileNavigation } from "@/components/site/mobile-navigation";
import { deployment } from "@/config/deployment";

const navigation = [
  { href: "/portfolio", label: "Portfolio" },
  { href: "/process", label: "Process" },
  { href: "/about", label: "About" },
  { href: "/faq", label: "FAQ" },
];

export function SiteHeader() {
  return (
    <>
      {deployment.isFreeDemo ? (
        <div className="bg-garnet text-porcelain px-4 py-2 text-center text-xs font-semibold tracking-[0.08em] uppercase">
          MVP demo · Free-tier limits apply · Availability and demo data may
          reset
        </div>
      ) : null}
      <header className="border-ink/8 bg-porcelain/90 sticky top-0 z-50 border-b backdrop-blur-xl">
        <a
          href="#main-content"
          className="bg-ink text-porcelain absolute top-4 left-4 z-[60] -translate-y-24 rounded-full px-4 py-2 focus:translate-y-0"
        >
          Skip to content
        </a>
        <div className="page-shell flex min-h-20 items-center justify-between gap-8">
          <Logo />
          <nav
            className="hidden items-center gap-7 lg:flex"
            aria-label="Primary navigation"
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link focus-visible:outline-garnet rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-3 sm:flex">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/start">Start your design</Link>
            </Button>
          </div>
          <MobileNavigation items={navigation} />
        </div>
      </header>
    </>
  );
}
