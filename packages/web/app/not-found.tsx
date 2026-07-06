import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { siteLinks } from "@/lib/site";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-sm font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
        404
      </p>
      <h1 className="text-3xl font-bold sm:text-4xl">This page could not be found.</h1>
      <p className="max-w-md text-[var(--color-ink-muted)]">
        The page you are looking for was moved, renamed, or never existed. Head back to the
        SuperPlot home page or browse the docs.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href={siteLinks.home}
          className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#05060a] transition hover:bg-[var(--color-accent-strong)]"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Back to home
        </Link>
        <Link
          href={siteLinks.docs}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)]"
        >
          Read the docs
        </Link>
      </div>
    </main>
  );
}
