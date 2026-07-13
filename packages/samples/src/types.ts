export type SampleRow = Record<string, string | number>;

export interface SampleContext {
  loadDataset(name: string): Promise<SampleRow[]>;
}

export interface SampleModule {
  mount(el: HTMLElement, ctx: SampleContext): () => void;
}

export interface ConversationTurn {
  role: "human" | "agent";
  content: string;
}

export interface Conversation {
  model?: string;
  date?: string;
  turns: ConversationTurn[];
}

export interface SampleEntry {
  load: () => Promise<SampleModule>;
  conversation: () => Promise<Conversation>;
}
