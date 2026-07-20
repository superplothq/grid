import type { AxisExpr } from "@superplot/grid";
import { getCompletions, parseExpression, validateAxis } from "./algebra";
import type { Completion } from "./algebra";

// A single-line table-algebra editor: a monospace input with a VSCode-style
// completion popup anchored at the caret and an inline validity icon (green tick
// / red cross, message in its tooltip). It parses and validates on every
// keystroke, debounces a commit of the valid AxisExpr to the host, and never
// fires a commit for an invalid expression.

const KIND_GLYPH: Record<Completion["kind"], string> = {
  operator: "ƒ",
  dimension: "◆",
  measure: "▮",
};

const CHECK_SVG = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 13l4 4L19 7\"/></svg>";
const CROSS_SVG = "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.6\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M6 6l12 12M18 6L6 18\"/></svg>";

interface EditorOptions {
  label: string;
  initial: string;
  onCommit: (expr: AxisExpr) => void;
  onFocus: () => void;
}

export class ExpressionEditor {
  readonly el: HTMLElement;
  private input: HTMLInputElement;
  private validIcon: HTMLElement;
  private popup: HTMLElement;
  private mirror: HTMLElement;
  private options: EditorOptions;

  private items: Completion[] = [];
  private selected = 0;
  private popupOpen = false;
  private commitTimer: ReturnType<typeof setTimeout> | null = null;
  private externalError: string | null = null;

  constructor(options: EditorOptions) {
    this.options = options;

    this.el = document.createElement("div");
    this.el.className = "ps-editor";

    const label = document.createElement("span");
    label.className = "ps-editor-label";
    label.textContent = options.label;

    const field = document.createElement("div");
    field.className = "ps-editor-field";

    this.input = document.createElement("input");
    this.input.type = "text";
    this.input.className = "ps-input";
    this.input.spellcheck = false;
    this.input.autocapitalize = "off";
    this.input.setAttribute("autocorrect", "off");
    this.input.value = options.initial;

    this.mirror = document.createElement("span");
    this.mirror.className = "ps-input-mirror";
    this.mirror.setAttribute("aria-hidden", "true");

    this.popup = document.createElement("div");
    this.popup.className = "ps-pop";
    this.popup.style.display = "none";

    this.validIcon = document.createElement("span");
    this.validIcon.className = "ps-valid";

    field.append(this.input, this.mirror, this.validIcon, this.popup);

    this.el.append(label, field);

    this.input.addEventListener("input", this.handleInput);
    this.input.addEventListener("keydown", this.handleKeyDown);
    this.input.addEventListener("focus", () => {
      options.onFocus();
      this.refreshCompletions();
    });
    this.input.addEventListener("blur", () => {
      // Delay so a click on a popup item registers before the popup hides.
      setTimeout(() => this.closePopup(), 120);
    });

    this.validateOnly();
  }

  getText(): string {
    return this.input.value;
  }

  focus(): void {
    this.input.focus();
  }

  // Insert a field/operator token at the caret (used by the left field panel).
  insertToken(token: string): void {
    const start = this.input.selectionStart ?? this.input.value.length;
    const end = this.input.selectionEnd ?? start;
    const before = this.input.value.slice(0, start);
    const after = this.input.value.slice(end);
    const needsSep = before !== "" && /[A-Za-z0-9_)]$/.test(before) && !/[(,\s]$/.test(before);
    const glue = needsSep ? ", " : "";
    const insert = glue + token;
    this.input.value = before + insert + after;
    const caret = start + insert.length;
    this.input.focus();
    this.input.setSelectionRange(caret, caret);
    this.handleInput();
  }

  // Let the host surface a cross-axis error (e.g. "no measure on either axis").
  setExternalError(message: string | null): void {
    this.externalError = message;
    this.renderStatus(this.currentValidity());
  }

  dispose(): void {
    if (this.commitTimer) clearTimeout(this.commitTimer);
    this.el.remove();
  }

  /* ===== internals ===== */

  private currentValidity(): { ok: boolean; error: string | null } {
    const parsed = parseExpression(this.input.value);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    const semantic = validateAxis(parsed.expr);
    if (semantic) return { ok: false, error: semantic };
    return { ok: true, error: null };
  }

  private handleInput = (): void => {
    this.validateOnly();
    this.refreshCompletions();
  };

  private validateOnly(): void {
    const validity = this.currentValidity();
    this.renderStatus(validity);
    if (this.commitTimer) clearTimeout(this.commitTimer);
    if (validity.ok) {
      this.commitTimer = setTimeout(() => {
        const fresh = parseExpression(this.input.value);
        if (fresh.ok && validateAxis(fresh.expr) === null) {
          this.options.onCommit(fresh.expr);
        }
      }, 320);
    }
  }

  private renderStatus(validity: { ok: boolean; error: string | null }): void {
    let state: "ok" | "error";
    let message: string;
    if (validity.ok && this.externalError) {
      state = "error";
      message = this.externalError;
    } else if (validity.ok) {
      state = "ok";
      message = "Valid expression";
    } else {
      state = "error";
      message = validity.error ?? "Invalid expression";
    }
    this.validIcon.dataset.state = state;
    this.validIcon.title = message;
    this.validIcon.innerHTML = state === "ok" ? CHECK_SVG : CROSS_SVG;
  }

  private refreshCompletions(): void {
    const caret = this.input.selectionStart ?? this.input.value.length;
    const query = getCompletions(this.input.value, caret);
    this.items = query.items;
    if (this.items.length === 0) {
      this.closePopup();
      return;
    }
    this.selected = 0;
    this.renderPopup(query.from);
  }

  private renderPopup(from: number): void {
    this.popup.innerHTML = "";
    this.items.forEach((item, i) => {
      const row = document.createElement("div");
      row.className = "ps-pop-item";
      if (i === this.selected) row.classList.add("sel");

      const glyph = document.createElement("span");
      glyph.className = `ps-pop-glyph kind-${item.kind}`;
      glyph.textContent = KIND_GLYPH[item.kind];

      const label = document.createElement("span");
      label.className = "ps-pop-label";
      label.textContent = item.label;

      const detail = document.createElement("span");
      detail.className = "ps-pop-detail";
      detail.textContent = item.detail;

      row.append(glyph, label, detail);
      row.addEventListener("mousedown", e => {
        e.preventDefault();
        this.accept(i);
      });
      row.addEventListener("mouseenter", () => {
        this.selected = i;
        this.highlight();
      });
      this.popup.append(row);
    });

    this.popup.style.left = `${this.caretPixels(from)}px`;
    this.popup.style.display = "block";
    this.popupOpen = true;
  }

  private highlight(): void {
    Array.from(this.popup.children).forEach((child, i) => {
      child.classList.toggle("sel", i === this.selected);
    });
  }

  private caretPixels(from: number): number {
    this.mirror.textContent = this.input.value.slice(0, from);
    const width = this.mirror.getBoundingClientRect().width;
    const max = this.input.clientWidth - 40;
    return Math.max(0, Math.min(width, max));
  }

  private accept(index: number): void {
    const item = this.items[index];
    const caret = this.input.selectionStart ?? this.input.value.length;
    const query = getCompletions(this.input.value, caret);
    const before = this.input.value.slice(0, query.from);
    const after = this.input.value.slice(query.to);
    this.input.value = before + item.insert + after;
    const newCaret = query.from + item.caretOffset;
    this.input.setSelectionRange(newCaret, newCaret);
    this.input.focus();
    this.handleInput();
  }

  private closePopup(): void {
    this.popup.style.display = "none";
    this.popupOpen = false;
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (this.popupOpen && this.items.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        this.selected = (this.selected + 1) % this.items.length;
        this.highlight();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        this.selected = (this.selected - 1 + this.items.length) % this.items.length;
        this.highlight();
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this.accept(this.selected);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        this.closePopup();
        return;
      }
    }
    if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.shiftKey) {
      // Re-evaluate completion context after the caret moves.
      setTimeout(() => this.refreshCompletions(), 0);
    }
  };
}
