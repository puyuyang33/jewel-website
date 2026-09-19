import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="atelier-grid grid min-h-screen place-items-center px-6">
      <div className="max-w-xl text-center">
        <p className="eyebrow">404 - Not found</p>
        <h1 className="display-title mt-5">A detail out of place.</h1>
        <p className="text-stone mx-auto mt-7 max-w-md text-lg leading-8">
          The page may have moved, or the private record may not be available to
          this account.
        </p>
        <Button asChild className="mt-9">
          <Link href="/">Return to the atelier</Link>
        </Button>
      </div>
    </main>
  );
}
