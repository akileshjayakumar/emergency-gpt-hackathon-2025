import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hawker Food Menu Helper",
  description:
    "Scan hawker menus, find healthy and value picks, and chat with an SG food expert.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/90 backdrop-blur">
          <div className="mx-auto max-w-5xl px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-block size-2.5 rounded-full bg-[var(--sg-red)]" />
              <span className="font-semibold tracking-tight">
                Hawker Food Menu Helper
              </span>
              <span className="tag">SG</span>
            </div>
            <nav className="hidden sm:flex items-center gap-3 text-xs text-gray-600">
              <span className="hidden md:inline">
                <span className="text-sm">
                  Made for food lovers in Singapore; powered by Groq
                </span>
              </span>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer className="mt-12 border-t border-gray-200 bg-white">
          <div className="mx-auto max-w-5xl px-4 py-8 text-gray-600">
            <p className="text-sm md:text-base">
              Built with <strong>Next.js</strong>, <strong>TailwindCSS</strong>,
              and <strong>Groq</strong>.
            </p>
            <p className="text-sm md:text-base mt-1">
              This app was built during the{" "}
              <a
                href="https://lu.ma/dn2iqbwu?tk=kM5Qjp"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-orange-500 underline underline-offset-2"
              >
                <span className="text-[var(--sg-orange)]">
                  EMERGENCY GPT HACKATHON 2025
                </span>
              </a>{" "}
              in Singapore — shoutout to{" "}
              <a
                href="https://openai.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                <strong>OpenAI</strong>
              </a>
              ,{" "}
              <a
                href="https://groq.com"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline underline-offset-2"
              >
                <strong>Groq</strong>
              </a>{" "}
              and the organizers for the energy and inspiration.
            </p>
          </div>
          ,
        </footer>
      </body>
    </html>
  );
}
