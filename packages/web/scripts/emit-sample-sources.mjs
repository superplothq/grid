import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const samplesPkg = path.resolve(webRoot, '../samples');
const samplesDir = path.join(samplesPkg, 'src/samples');
const outDir = path.join(webRoot, 'public/samples');

fs.rmSync(outDir, { recursive: true, force: true });

const entries = fs
  .readdirSync(samplesDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && fs.existsSync(path.join(samplesDir, e.name, 'sample.ts')));

for (const entry of entries) {
  const id = entry.name;
  const srcDir = path.join(samplesDir, id);
  const destDir = path.join(outDir, id);
  fs.mkdirSync(destDir, { recursive: true });

  const sampleSource = fs.readFileSync(path.join(srcDir, 'sample.ts'), 'utf8');
  fs.writeFileSync(path.join(destDir, 'sample.ts'), sampleSource);

  const conversationPath = path.join(srcDir, 'conversation.json');
  const conversation = fs.existsSync(conversationPath)
    ? JSON.parse(fs.readFileSync(conversationPath, 'utf8'))
    : null;
  if (conversation) fs.copyFileSync(conversationPath, path.join(destDir, 'conversation.json'));

  for (const file of fs.readdirSync(srcDir)) {
    if (file.startsWith('thumbnail.')) fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
  }

  const mdx = fs.readFileSync(path.join(srcDir, 'index.mdx'), 'utf8');

  // Resolve relative imports out of the sample into runtime/type helper sources
  const helperFiles = new Map();
  const importRe = /from\s+"(\.\.[^"]+)"/g;
  for (const match of sampleSource.matchAll(importRe)) {
    const resolved = path.resolve(srcDir, `${match[1]}.ts`);
    if (resolved.startsWith(path.join(samplesPkg, 'src')) && fs.existsSync(resolved)) {
      helperFiles.set(path.relative(samplesPkg, resolved), fs.readFileSync(resolved, 'utf8'));
    }
  }

  const sections = [
    `# Sample: ${id}`,
    '',
    '## Page (index.mdx)',
    '',
    '````mdx',
    mdx.trim(),
    '````',
    '',
    '## sample.ts',
    '',
    '```ts',
    sampleSource.trim(),
    '```',
  ];

  for (const [file, content] of helperFiles) {
    sections.push('', `## helper: ${file}`, '', '```ts', content.trim(), '```');
  }

  if (conversation) {
    sections.push('', '## Conversation');
    for (const turn of conversation.turns) {
      sections.push('', `**${turn.role}**: ${turn.content}`);
    }
  }

  fs.writeFileSync(path.join(destDir, 'llms.txt'), sections.join('\n') + '\n');
}

const index = entries.map((e) => `- /samples/${e.name}/llms.txt`).join('\n');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.txt'), `# Samples\n\n${index}\n`);

console.log(`emitted sources for ${entries.length} sample(s) to public/samples`);

const agentsGuide = path.resolve(webRoot, '../grid/AGENTS.md');
fs.copyFileSync(agentsGuide, path.join(webRoot, 'public/grid/agents.md'));
console.log('copied grid AGENTS.md to public/grid/agents.md');
