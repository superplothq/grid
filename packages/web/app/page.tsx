import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { GithubMark } from "@/components/icons";
import { appName, siteLinks } from "@/lib/site";
import {
  agentStackItems,
  approachIntro,
  comparison,
  comparisonIntro,
  demos,
  demosIntro,
  faqs,
  features,
  featuresIntro,
  footerLinks,
  getStartedIntro,
  getStartedSteps,
  heroContent,
  principles,
  type HomeLink,
} from "./home-data";
import { CopyPromptButton, FAQAccordion, HomeDemoTabs } from "./home-client";

const navLinks: HomeLink[] = [
  { label: "Approach", href: siteLinks.approach },
  { label: "Demos", href: siteLinks.demos },
  { label: "Features", href: siteLinks.features },
  { label: "FAQ", href: siteLinks.faq },
  { label: "Docs", href: siteLinks.docs },
];

function HomeLinkAnchor({
  link,
  className,
  children,
}: {
  link: HomeLink;
  className?: string;
  children?: React.ReactNode;
}) {
  const content = children ?? link.label;

  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noreferrer"
        aria-label={link.ariaLabel}
        className={className}
      >
        {content}
      </a>
    );
  }

  if (link.href.startsWith("mailto:") || link.href.startsWith("#")) {
    return (
      <a href={link.href} aria-label={link.ariaLabel} className={className}>
        {content}
      </a>
    );
  }

  return (
    <Link href={link.href} aria-label={link.ariaLabel} className={className}>
      {content}
    </Link>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-6">
        <Link href={siteLinks.home} className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-7 place-items-center rounded-md bg-[var(--color-accent)] text-sm font-bold text-[#05060a]">
            S
          </span>
          <span className="text-[15px]">{appName}</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
          {navLinks.map((link) => (
            <HomeLinkAnchor
              key={link.href}
              link={link}
              className="rounded-md px-3 py-1.5 text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
            />
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={siteLinks.github}
            target="_blank"
            rel="noreferrer"
            aria-label="SuperPlot on GitHub"
            className="grid size-9 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-ink-muted)] transition hover:border-[var(--color-border-strong)] hover:text-[var(--color-ink)]"
          >
            <GithubMark className="size-4" />
          </a>
          <Link
            href={siteLinks.demos}
            className="hidden rounded-md bg-[var(--color-accent)] px-3.5 py-2 text-sm font-semibold text-[#05060a] transition hover:bg-[var(--color-accent-strong)] sm:inline-flex"
          >
            View demos
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--color-border)]">
      <div className="grid-noise pointer-events-none absolute inset-0 opacity-70" aria-hidden />
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-[var(--color-accent)]/15 blur-[120px]"
        aria-hidden
      />
      <div className="relative mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-[1fr_460px] lg:py-24">
        <div className="flex flex-col justify-center">
          <span className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-3 py-1 text-xs font-medium text-[var(--color-ink-muted)]">
            <span className="size-1.5 rounded-full bg-[var(--color-positive)]" aria-hidden />
            {heroContent.eyebrow}
          </span>
          <h1 className="mt-6 max-w-2xl text-4xl font-bold leading-[1.05] sm:text-5xl lg:text-6xl">
            {heroContent.headline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-ink-muted)]">
            {heroContent.body}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            {heroContent.primaryCtas.map((link, index) => (
              <HomeLinkAnchor
                key={link.href}
                link={link}
                className={
                  index === 0
                    ? "inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#05060a] transition hover:bg-[var(--color-accent-strong)]"
                    : "inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)]"
                }
              >
                {link.label}
                {index === 0 ? <ArrowRight className="size-4" aria-hidden /> : null}
              </HomeLinkAnchor>
            ))}
          </div>
        </div>

        <aside
          aria-label="Agent prompt"
          className="flex flex-col rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              {heroContent.agentPromptTitle}
            </span>
            <div className="flex gap-1.5" aria-hidden>
              <span className="size-2.5 rounded-full bg-[var(--color-surface-3)]" />
              <span className="size-2.5 rounded-full bg-[var(--color-surface-3)]" />
              <span className="size-2.5 rounded-full bg-[var(--color-surface-3)]" />
            </div>
          </div>
          <pre className="flex-1 whitespace-pre-wrap px-4 py-4 font-mono text-[13px] leading-relaxed text-[var(--color-ink-muted)]">
            {heroContent.agentPrompt}
          </pre>
          <div className="flex flex-col gap-3 border-t border-[var(--color-border)] px-4 py-4">
            <CopyPromptButton text={heroContent.agentPrompt} />
            <div className="flex flex-wrap items-center gap-4 text-sm">
              {heroContent.secondaryCtas.map((link) => (
                <HomeLinkAnchor
                  key={link.href}
                  link={link}
                  className="inline-flex items-center gap-1.5 text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
                >
                  {link.label.includes("GitHub") ? (
                    <GithubMark className="size-4" />
                  ) : null}
                  {link.label}
                </HomeLinkAnchor>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AgentStack() {
  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/40">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-6">
        <span className="text-sm font-medium text-[var(--color-ink-faint)]">
          Built for any agent and stack
        </span>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {agentStackItems.map((item) => (
            <span key={item} className="text-sm font-medium text-[var(--color-ink-muted)]">
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <div className="max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent)]">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-3xl font-bold sm:text-4xl">{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-[var(--color-ink-muted)]">{intro}</p>
    </div>
  );
}

function Demos() {
  return (
    <section id="demos" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeading eyebrow="Demos" title="Use cases, built by agents" intro={demosIntro} />
        <div className="mt-10">
          <HomeDemoTabs demos={demos} />
        </div>
      </div>
    </section>
  );
}

function Principles() {
  return (
    <section id="approach" className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeading
          eyebrow="Our guiding principles"
          title="Designed for agentic development"
          intro={approachIntro}
        />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {principles.map((principle) => (
            <Link
              key={principle.id}
              href={principle.href}
              className="group flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 transition hover:border-[var(--color-accent)]"
            >
              <h3 className="text-lg font-semibold">{principle.title}</h3>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {principle.body}
              </p>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)]">
                Learn more
                <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Features() {
  return (
    <section id="features" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeading
          eyebrow="Core features & capabilities"
          title="The grid behaviors teams rebuild by hand"
          intro={featuresIntro}
        />
        <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-border)] sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Link
              key={feature.id}
              href={feature.href}
              className="group flex flex-col bg-[var(--color-surface)] p-6 transition hover:bg-[var(--color-surface-2)]"
            >
              <h3 className="text-base font-semibold text-[var(--color-ink)]">{feature.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {feature.body}
              </p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-ink-faint)] transition group-hover:text-[var(--color-accent)]">
                Docs
                <ArrowUpRight className="size-3.5" aria-hidden />
              </span>
            </Link>
          ))}
        </div>
        <div className="mt-8">
          <Link
            href={siteLinks.docs}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)]"
          >
            Explore all features
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}

function WhySuperPlot() {
  return (
    <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeading
          eyebrow="Why SuperPlot"
          title="Batteries included, not bolted on"
          intro={comparisonIntro}
        />
        <div className="mt-10 overflow-hidden rounded-xl border border-[var(--color-border)]">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="bg-[var(--color-surface-2)]">
                <th className="px-5 py-3 font-semibold text-[var(--color-ink-faint)]">Capability</th>
                <th className="px-5 py-3 font-semibold text-[var(--color-accent)]">SuperPlot</th>
                <th className="px-5 py-3 font-semibold text-[var(--color-ink-faint)]">Simple table libs</th>
                <th className="px-5 py-3 font-semibold text-[var(--color-ink-faint)]">In-house build</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.capability} className="border-t border-[var(--color-border)]">
                  <td className="px-5 py-4 font-medium text-[var(--color-ink)]">{row.capability}</td>
                  <td className="px-5 py-4 text-[var(--color-ink)]">{row.superplot}</td>
                  <td className="px-5 py-4 text-[var(--color-ink-muted)]">{row.simple}</td>
                  <td className="px-5 py-4 text-[var(--color-ink-muted)]">{row.inHouse}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section id="faq" className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-4xl px-6 py-20">
        <SectionHeading
          eyebrow="Common questions"
          title="Everything you need to evaluate SuperPlot"
          intro="Straight answers for developers, teams, and the agents building on top of the grid."
        />
        <div className="mt-10">
          <FAQAccordion faqs={faqs} />
        </div>
      </div>
    </section>
  );
}

function GetStarted() {
  return (
    <section id="get-started" className="border-b border-[var(--color-border)] bg-[var(--color-surface)]/30">
      <div className="mx-auto max-w-7xl px-6 py-20">
        <SectionHeading eyebrow="Get started" title="Ship a grid in three steps" intro={getStartedIntro} />
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {getStartedSteps.map((step, index) => (
            <div
              key={step.id}
              className="flex flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <span className="grid size-8 place-items-center rounded-md bg-[var(--color-accent-soft)] font-mono text-sm font-semibold text-[var(--color-accent-strong)]">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-semibold">{step.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--color-ink-muted)]">
                {step.body}
              </p>
              <pre className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-canvas)] px-3 py-3 font-mono text-xs leading-relaxed text-[var(--color-ink-muted)]">
                {step.code}
              </pre>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={siteLinks.docs}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#05060a] transition hover:bg-[var(--color-accent-strong)]"
          >
            Read the docs
            <ArrowRight className="size-4" aria-hidden />
          </Link>
          <a
            href={siteLinks.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-5 py-2.5 text-sm font-semibold text-[var(--color-ink)] transition hover:border-[var(--color-accent)]"
          >
            <GithubMark className="size-4" />
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="bg-[var(--color-canvas)]">
      <div className="mx-auto max-w-7xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.5fr_2fr]">
          <div>
            <div className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-md bg-[var(--color-accent)] text-sm font-bold text-[#05060a]">
                S
              </span>
              {footerLinks.brand}
            </div>
            <p className="mt-4 text-sm text-[var(--color-ink-faint)]">{footerLinks.legal}</p>
            <a
              href={`mailto:${footerLinks.email}`}
              className="mt-2 inline-block text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
            >
              {footerLinks.email}
            </a>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {footerLinks.columns.map((column) => (
              <div key={column.title}>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-ink-faint)]">
                  {column.title}
                </h3>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) => (
                    <li key={link.href}>
                      <HomeLinkAnchor
                        link={link}
                        className="text-sm text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-12 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-ink-faint)]">
          {appName} — the JavaScript grid built for agents.
        </div>
      </div>
    </footer>
  );
}

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <Hero />
        <AgentStack />
        <Demos />
        <Principles />
        <Features />
        <WhySuperPlot />
        <FAQSection />
        <GetStarted />
      </main>
      <SiteFooter />
    </>
  );
}
