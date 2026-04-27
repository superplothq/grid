## Writing Guidelines

The primary audience is LLM coding agents; the secondary audience is developers. Both will read these docs and build complex grids on their own, without access to the source code. The docs must be self-contained - if something isn't documented here, the reader can't know it.

1. **Simple language.** No project-specific jargon. If a simpler word works, use it. Write as if the reader has never seen this codebase.
2. **Brevity.** Don't overexplain. Use common terms from programming / frontend engineering / data engineering.
3. **Define before you use.** Before using any term (e.g. "ref-counting", "pivot config", "DataViewModel"), explain what it means in plain words or link to its doc page. Never assume the reader already knows a term.
4. **Show alongside telling.** Every concept needs a code snippet right next to the explanation. These snippets should be short, showing how the API is consumed by downstream code.
5. **Self-contained pages.** A reader should be able to follow a page top-to-bottom without jumping elsewhere. Include enough context on each page that it stands alone. Link to other pages for deeper dives, not for prerequisites.
6. **One idea per section.** If a section covers two concepts, split it.
7. **Explicit shapes.** When describing a method's input or output, show the exact type signature or object shape in a code block. Don't describe structure only in prose - agents parse code blocks more reliably than natural language descriptions of shapes.
8. **No ambiguity.** Avoid words like "usually", "might", "sometimes" unless documenting genuinely optional behavior. State what happens, not what could happen. An agent can't ask clarifying questions.
9. **Do not use em dashes.** Use - or ; instead.
