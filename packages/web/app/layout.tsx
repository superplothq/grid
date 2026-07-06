import type { Metadata } from "next";
import { Google_Sans, JetBrains_Mono } from "next/font/google";
import { appName, productName } from "@/lib/site";
import "./global.css";

const googleSans = Google_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-title",
});

export const metadata: Metadata = {
  title: {
    default: `${appName} — The JavaScript grid built for agents`,
    template: `%s — ${appName}`,
  },
  description:
    `${productName} lets developers and coding agents build advanced grids, pivots, and data views with typed APIs, composable primitives, and prompts agents can actually follow.`,
  keywords: [
    "javascript grid",
    "data grid",
    "pivot table",
    "react data grid",
    "headless grid",
    "agent grid",
    productName,
  ],
  openGraph: {
    title: `${appName} — The JavaScript grid built for agents`,
    description:
      "Build advanced grids, pivots, and data views with a composable architecture designed for developers and AI agents.",
    siteName: appName,
    type: "website",
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${googleSans.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <meta
          name="format-detection"
          content="telephone=no, date=no, email=no, address=no"
        />
      </head>
      <body className="flex min-h-screen flex-col">{children}</body>
    </html>
  );
}
