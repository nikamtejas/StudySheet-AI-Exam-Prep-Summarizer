import type { Metadata } from "next";
import "katex/dist/katex.min.css";
import "../globals.css";
import { clashDisplay, satoshi, jetbrainsMono } from "@/lib/fonts";

export const metadata: Metadata = {
  title: "StudySheet",
  description: "AI exam-prep PDF summarizer.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${clashDisplay.variable} ${satoshi.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
