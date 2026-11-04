import fs from 'node:fs';
import path from 'node:path';
const files = ['README.md', ...fs.readdirSync('docs').filter(name => name.endsWith('.md')).map(name => `docs/${name}`)];
const missing = [];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)#]+)(?:#[^)]*)?\)/g)) {
    if (/^(https?:|mailto:|#)/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!fs.existsSync(resolved)) missing.push(`${file}: ${target}`);
  }
}
if (missing.length) { console.error(`Broken local links:\n${missing.join('\n')}`); process.exit(1); }
console.log(`Checked local links in ${files.length} documentation files.`);
