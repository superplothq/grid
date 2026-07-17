import {
  FacetPredicate,
  CellPredicate,
  SelectionProps,
  PredicateNode,
} from "../types";
import { SelectionRuleStore } from "./rule-store";

type WithSideEffectsBase = { owner: SelectionRuleStore; predicates: PredicateNode[]; ruleIds: number[] };

function WithSideEffects<T extends new (...args: any[]) => WithSideEffectsBase>(Base: T) {
  return class extends Base {
    prop(props: SelectionProps): this {
      const id = this.owner.addRule(this.predicates, { type: "prop", props });
      this.ruleIds.push(id);
      return this;
    }

    group(grpVal: string, grpName = "def"): this {
      return this.style((el) => { el.dataset[`selGrp${grpName}`] = grpVal; });
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

class SelectionBase {
  ruleIds: number[];
  constructor(public owner: SelectionRuleStore, public predicates: PredicateNode[], ruleIds?: number[]) {
    this.ruleIds = ruleIds ?? [];
  }
}

const SelectionWithSideEffects = WithSideEffects(SelectionBase);

export class Selection extends SelectionWithSideEffects {
  selectAll(predicate: FacetPredicate): Selection {
    return new Selection(this.owner, [...this.predicates, { type: "facet", predicate }], this.ruleIds);
  }

  selectAllCell(predicate: CellPredicate): CellSelection {
    return new CellSelection(this.owner, [...this.predicates, { type: "cell", predicate }], this.ruleIds);
  }
}

export class CellSelection extends WithSideEffects(SelectionBase) {}
