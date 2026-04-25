## Writing Guidelines

The audience is  AI agents (primary persona) and developer (secondary persona) who will read these docs and build complex grids on their own, without access to the source code or a human to ask. The docs must be self-contained — if something isn't documented here, the reader can't know it.

1. **Simple language.** No project specific jargon. If a simpler word works, use it. Write as if the reader has never seen this codebase.
2. **Brevity**: Don't overexplain. Use common terms used in programming / frontend engineering / data engineering to explain concept.
3. **Define before you use.** Before using any term (e.g. "ref-counting", "pivot config", "DataViewModel"), explain what it means in plain words or link to its doc page if one exists. Never assume the reader already knows a term.
4. **Show alongside telling.** Every concept needs a code snippet or example right next to the explanation. Don't describe behavior without demonstrating it. This code example's are mostly short showing how the api is being consumed by the downstream.
5. **Self-contained pages.** A reader should be able to follow a page top-to-bottom without jumping elsewhere. Include enough context on each page that it stands alone. Link to other pages for deeper dives, not for prerequisites.
6. **One idea per section.** If a section covers two concepts, split it.
