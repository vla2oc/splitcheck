import type { Metadata } from "next";
import {
  Geist_Mono,
  Instrument_Sans,
  Instrument_Serif,
} from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { MotionConfig } from "motion/react";
import "./globals.css";

// latin-ext — польские ą ę ł ń ó ś ź ż
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin", "latin-ext"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "latin-ext"],
});

// Только одно слово в заголовке главной — docs/SPEC.md «Шрифты»
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: "italic",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  title: "SplitCheck",
  description: "Podziel rachunek w 10 sekund. Bez rejestracji. Bez aplikacji.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: расширения браузера дописывают классы в <html> (mdl-js) до гидрации; действует только на сам <html>
    <html
      suppressHydrationWarning
      lang="pl"
      className={`${instrumentSans.variable} ${geistMono.variable} ${instrumentSerif.variable} h-full antialiased`}
    >
      <body className="min-h-full  flex flex-col">
        <div className="aurora" aria-hidden="true"></div>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
        {/* Vercel Web Analytics: просмотры страниц — в дашборде Vercel → Analytics (включается там же) */}
        <Analytics />
      </body>
    </html>
  );
}
