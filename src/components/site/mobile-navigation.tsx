"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

interface NavigationItem {
  href: string;
  label: string;
}

export function MobileNavigation({ items }: { items: NavigationItem[] }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Button
          className="xl:hidden"
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
        >
          <Menu aria-hidden="true" size={21} />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-ink/35 fixed inset-0 z-[70] backdrop-blur-sm data-[state=closed]:animate-[fade-out_180ms_ease] data-[state=open]:animate-[fade-in_180ms_ease]" />
        <Dialog.Content className="border-ink/10 bg-porcelain fixed inset-x-3 top-3 z-[80] max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-[1.75rem] border p-5 shadow-2xl focus:outline-none sm:left-auto sm:w-[26rem]">
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-display text-2xl">
              Veyra Atelier
            </Dialog.Title>
            <Dialog.Description className="sr-only">
              Browse the atelier and access your private workspace.
            </Dialog.Description>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close navigation">
                <X aria-hidden="true" size={22} />
              </Button>
            </Dialog.Close>
          </div>
          <nav
            className="border-ink/10 mt-10 flex flex-col border-y"
            aria-label="Mobile navigation"
          >
            {items.map((item) => (
              <Dialog.Close asChild key={item.href}>
                <Link
                  href={item.href}
                  className="border-ink/10 font-display focus-visible:outline-garnet flex min-h-16 items-center border-b px-2 py-4 text-2xl last:border-b-0 focus-visible:outline-2 sm:text-3xl"
                >
                  {item.label}
                </Link>
              </Dialog.Close>
            ))}
          </nav>
          <div className="mt-6 grid gap-3">
            <Dialog.Close asChild>
              <Button asChild>
                <Link href="/start">Start your design</Link>
              </Button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <Button asChild variant="secondary">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
