import { PredicateNode, MatchingRule, TerminalOp } from "../types";

export class MatchingRuleStore {
  #rules: MatchingRule[] = [];
  #nextId = 0;
  #onRuleChange: () => void;
  #pending = false;

  constructor(onRuleChange: () => void) {
    this.#onRuleChange = onRuleChange;
  }

  #scheduleChange(): void {
    if (this.#pending) return;
    this.#pending = true;
    queueMicrotask(() => {
      this.#pending = false;
      this.#onRuleChange();
    });
  }

  addRule(predicates: PredicateNode[], terminal: TerminalOp): number {
    const id = this.#nextId++;
    this.#rules.push({ id, predicates, terminal });
    this.#scheduleChange();
    return id;
  }

  removeRules(ids: number[]): void {
    this.#rules = this.#rules.filter(r => !ids.includes(r.id));
    this.#scheduleChange();
  }

  get rules(): readonly MatchingRule[] {
    return this.#rules;
  }
}
