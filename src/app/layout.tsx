import type { Metadata, Viewport } from "next";
import { Afacad, Bodoni_Moda } from "next/font/google";

import { seo } from "@/config/brand";

import "./globals.css";

const bodyFont = Afacad({
  subsets: ["latin"],
  variable: "--font-afacad",
  display: "swap",
});

const displayFont = Bodoni_Moda({
  subsets: ["latin"],
  variable: "--font-bodoni",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: seo.defaultTitle,
    template: seo.titleTemplate,
  },
  description: seo.description,
  applicationName: "Veyra Atelier",
  category: "design",
  openGraph: {
    type: "website",
    siteName: "Veyra Atelier",
    title: seo.defaultTitle,
    description: seo.description,
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f6f2ea",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${bodyFont.variable} ${displayFont.variable} antialiased`}
    >
      <body>{children}</body>
    </html>
  );
}
