export type SampleValue = string | number | null | undefined;
export type SampleRow = Record<string, SampleValue>;

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

// A demo reuses the SampleModule contract but is surfaced on web's plain /demos
// page instead of the docs gallery: no mdx, no conversation, self-contained data.
export interface DemoEntry {
  title: string;
  description: string;
  load: () => Promise<SampleModule>;
}
