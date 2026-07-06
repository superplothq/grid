"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Clipboard,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { GithubMark } from "@/components/icons";
import type { DemoTheme, FAQ, HomeDemo } from "./home-data";

type CopyState = "idle" | "copied" | "error";

export function CopyPromptButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>("idle");

  async function copy() {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }
      await navigator.clipboard.writeText(text);
      setState("copied");
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    if (state === "idle") return;
    const id = window.setTimeout(() => setState("idle"), 1800);
    return () => window.clearTimeout(id);
  }, [state]);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={copy}
        aria-live="polite"
        className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05060a] transition hover:bg-[var(--color-accent-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent-strong)]"
      >
        {state === "copied" ? (
          <Check className="size-4" aria-hidden />
        ) : (
          <Clipboard className="size-4" aria-hidden />
        )}
        {state === "copied" ? "Copied" : "Copy to your agent"}
      </button>
      {state === "error" ? (
        <span className="text-xs text-[var(--color-danger)]">
          Copy failed — select the prompt above to copy manually.
        </span>
      ) : null}
    </div>
  );
}

const themeOptions: { id: DemoTheme; label: string }[] = [
  { id: "operator", label: "Operator" },
  { id: "studio", label: "Studio" },
  { id: "contrast", label: "Contrast" },
];

function ThemePicker({
  value,
  onChange,
}: {
  value: DemoTheme;
  onChange: (theme: DemoTheme) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Preview theme"
      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1"
    >
      {themeOptions.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.id)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              active
                ? "bg-[var(--color-surface-3)] text-[var(--color-ink)]"
                : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function DemoPreview({ demo, theme }: { demo: HomeDemo; theme: DemoTheme }) {
  return (
    <div
      data-demo-theme={theme}
      className="animate-fade-in overflow-hidden rounded-xl border"
      style={{
        background: "var(--demo-bg)",
        borderColor: "var(--demo-border)",
        color: "var(--demo-ink)",
      }}
    >
      <div
        className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4"
        style={{ borderColor: "var(--demo-border)" }}
      >
        <div>
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.14em]"
            style={{ color: "var(--demo-accent)" }}
          >
            {demo.eyebrow}
          </p>
          <h3 className="mt-1 text-lg font-semibold" style={{ color: "var(--demo-ink)" }}>
            {demo.title}
          </h3>
          <p
            className="mt-1 max-w-xl text-sm"
            style={{ color: "var(--demo-muted)" }}
          >
            {demo.description}
          </p>
        </div>
        {demo.badges?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {demo.badges.map((badge) => (
              <span
                key={badge}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-medium"
                style={{
                  borderColor: "var(--demo-border)",
                  color: "var(--demo-muted)",
                }}
              >
                {badge}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {demo.kpis?.length ? (
        <dl
          className="grid grid-cols-3 gap-px border-b"
          style={{ background: "var(--demo-border)", borderColor: "var(--demo-border)" }}
        >
          {demo.kpis.map((kpi) => (
            <div
              key={kpi.label}
              className="px-5 py-3"
              style={{ background: "var(--demo-panel)" }}
            >
              <dt
                className="text-[11px] uppercase tracking-wide"
                style={{ color: "var(--demo-muted)" }}
              >
                {kpi.label}
              </dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold" style={{ color: "var(--demo-ink)" }}>
                  {kpi.value}
                </span>
                {kpi.trend ? (
                  <span className="text-xs font-medium" style={{ color: "var(--color-positive)" }}>
                    {kpi.trend}
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div role="table" aria-label={`${demo.title} preview`} className="text-sm">
        <div
          role="row"
          className="grid px-2"
          style={{
            gridTemplateColumns: `repeat(${demo.columns.length}, minmax(0, 1fr))`,
            background: "var(--demo-head)",
          }}
        >
          {demo.columns.map((column) => (
            <div
              role="columnheader"
              key={column.key}
              className={`px-3 py-2 text-[11px] font-semibold uppercase tracking-wide ${
                column.align === "right" ? "text-right" : "text-left"
              }`}
              style={{ color: "var(--demo-muted)" }}
            >
              {column.label}
            </div>
          ))}
        </div>
        {demo.rows.map((row, index) => (
          <div
            role="row"
            key={index}
            className="grid px-2"
            style={{
              gridTemplateColumns: `repeat(${demo.columns.length}, minmax(0, 1fr))`,
              background: index % 2 === 0 ? "var(--demo-row)" : "var(--demo-row-alt)",
            }}
          >
            {demo.columns.map((column, colIndex) => (
              <div
                role="cell"
                key={column.key}
                className={`whitespace-pre px-3 py-2 ${
                  column.align === "right" ? "text-right tabular-nums" : "text-left"
                } ${colIndex === 0 ? "font-medium" : ""}`}
                style={{
                  color: colIndex === 0 ? "var(--demo-ink)" : "var(--demo-muted)",
                }}
              >
                {row[column.key]}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PromptDialog({
  demo,
  onClose,
}: {
  demo: HomeDemo;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(id);
  }, [copied]);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(demo.prompt);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Prompt for ${demo.title} demo`}
        onClick={(event) => event.stopPropagation()}
        className="animate-fade-in w-full max-w-2xl rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-surface)] shadow-2xl"
      >
        <div className="flex items-start justify-between border-b border-[var(--color-border)] px-6 py-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              <Sparkles className="size-3.5" aria-hidden /> Agent build brief
            </p>
            <h4 className="mt-1 text-lg font-semibold">{demo.title}</h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close prompt"
            className="rounded-md p-1.5 text-[var(--color-ink-faint)] transition hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <div className="px-6 py-5">
          <pre className="whitespace-pre-wrap rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4 font-mono text-sm leading-relaxed text-[var(--color-ink-muted)]">
            {demo.prompt}
          </pre>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-6 py-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={demo.docsHref}
              className="inline-flex items-center gap-1 text-[var(--color-accent)] hover:text-[var(--color-accent-strong)]"
            >
              Read the docs <ArrowUpRight className="size-4" aria-hidden />
            </Link>
            {demo.githubHref ? (
              <a
                href={demo.githubHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              >
                <GithubMark className="size-4" /> See on GitHub
              </a>
            ) : null}
          </div>
          <button
            type="button"
            onClick={copyPrompt}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-accent)] px-3.5 py-2 text-sm font-semibold text-[#05060a] transition hover:bg-[var(--color-accent-strong)]"
          >
            {copied ? <Check className="size-4" aria-hidden /> : <Clipboard className="size-4" aria-hidden />}
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function HomeDemoTabs({ demos }: { demos: HomeDemo[] }) {
  const [activeDemoId, setActiveDemoId] = useState(demos[0]?.id ?? "");
  const [activeTheme, setActiveTheme] = useState<DemoTheme>("operator");
  const [openPromptDemoId, setOpenPromptDemoId] = useState<string | null>(null);

  const activeDemo = useMemo(
    () => demos.find((demo) => demo.id === activeDemoId) ?? demos[0],
    [activeDemoId, demos],
  );
  const promptDemo = demos.find((demo) => demo.id === openPromptDemoId);

  if (!activeDemo) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          role="tablist"
          aria-label="Demo use cases"
          className="inline-flex flex-wrap gap-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-1"
        >
          {demos.map((demo) => {
            const active = demo.id === activeDemo.id;
            return (
              <button
                key={demo.id}
                type="button"
                role="tab"
                id={`tab-${demo.id}`}
                aria-selected={active}
                aria-controls={`panel-${demo.id}`}
                onClick={() => setActiveDemoId(demo.id)}
                className={`rounded-md px-3.5 py-1.5 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                    : "text-[var(--color-ink-faint)] hover:text-[var(--color-ink-muted)]"
                }`}
              >
                {demo.title}
              </button>
            );
          })}
        </div>
        <ThemePicker value={activeTheme} onChange={setActiveTheme} />
      </div>

      <div id={`panel-${activeDemo.id}`} role="tabpanel" aria-labelledby={`tab-${activeDemo.id}`}>
        <DemoPreview demo={activeDemo} theme={activeTheme} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpenPromptDemoId(activeDemo.id)}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-medium text-[var(--color-ink)] transition hover:border-[var(--color-accent)] hover:bg-[var(--color-surface-3)]"
        >
          <Sparkles className="size-4 text-[var(--color-accent)]" aria-hidden />
          See the prompt for this demo
        </button>
        <Link
          href={activeDemo.docsHref}
          className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
        >
          View related docs <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>

      {promptDemo ? (
        <PromptDialog demo={promptDemo} onClose={() => setOpenPromptDemoId(null)} />
      ) : null}
    </div>
  );
}

export function FAQAccordion({ faqs }: { faqs: FAQ[] }) {
  const [openId, setOpenId] = useState<string | null>(faqs[0]?.id ?? null);

  return (
    <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]">
      {faqs.map((faq) => {
        const open = faq.id === openId;
        return (
          <article key={faq.id}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`faq-${faq.id}`}
              onClick={() => setOpenId(open ? null : faq.id)}
              className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--color-surface-2)]"
            >
              <span className="font-medium text-[var(--color-ink)]">{faq.question}</span>
              <ChevronDown
                className={`size-5 shrink-0 text-[var(--color-ink-faint)] transition-transform ${
                  open ? "rotate-180" : ""
                }`}
                aria-hidden
              />
            </button>
            {open ? (
              <p
                id={`faq-${faq.id}`}
                className="animate-fade-in px-5 pb-5 text-sm leading-relaxed text-[var(--color-ink-muted)]"
              >
                {faq.answer}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
