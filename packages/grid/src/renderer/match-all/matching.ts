import {
  FacetPredicate,
  CellPredicate,
  MatchingRuleProps,
  PredicateNode,
} from "../types";
import { MatchingRuleStore } from "./rule-store";

type WithSideEffectsBase = { owner: MatchingRuleStore; predicates: PredicateNode[]; ruleIds: number[] };

function WithSideEffects<T extends new (...args: any[]) => WithSideEffectsBase>(Base: T) {
  return class extends Base {
    prop(props: MatchingRuleProps): this {
      const id = this.owner.addRule(this.predicates, { type: "prop", props });
      this.ruleIds.push(id);
      return this;
    }

    group(grpVal: string, grpName = "def"): this {
      return this.style((el) => { el.dataset[`matchGrp${grpName}`] = grpVal; });
    }

    style(fn: (container: HTMLElement) => void): this {
      const id = this.owner.addRule(this.predicates, { type: "style", fn });
      this.ruleIds.push(id);
      return this;
    }

    undo(): void {
      this.owner.removeRules(this.ruleIds);
    }
  };
}

class MatchingBase {
  ruleIds: number[];
  constructor(public owner: MatchingRuleStore, public predicates: PredicateNode[], ruleIds?: number[]) {
    this.ruleIds = ruleIds ?? [];
  }
}

const MatchingWithSideEffects = WithSideEffects(MatchingBase);

export class Matching extends MatchingWithSideEffects {
  matchAll(predicate: FacetPredicate): Matching {
    return new Matching(this.owner, [...this.predicates, { type: "facet", predicate }], this.ruleIds);
  }

  matchAllCell(predicate: CellPredicate): CellMatching {
    return new CellMatching(this.owner, [...this.predicates, { type: "cell", predicate }], this.ruleIds);
  }
}

export class CellMatching extends WithSideEffects(MatchingBase) {}
