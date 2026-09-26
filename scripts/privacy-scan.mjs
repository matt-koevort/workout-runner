import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
// Public inputs and built assets only. Test fixtures are explicitly synthetic.
const roots = ['src', 'public', 'schemas', 'docs', 'scripts', 'dist-web'];
const files = ['README.md', 'index.html', 'package.json', 'package-lock.json'];
function walk(path) { for (const name of readdirSync(path)) { const file = join(path, name); if (statSync(file).isDirectory()) walk(file); else files.push(file); } }
for (const root of roots) walk(root);
const forbidden = [/\/(?:Users|home)\/[^\s"']+/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|sk-[A-Za-z0-9]{24,})\b/];
const findings=[];
for (const file of files) {
 const text=readFileSync(file,'utf8');
 if (file !== 'scripts/privacy-scan.mjs' && forbidden.some(pattern=>pattern.test(text))) findings.push(file);
 if (file.startsWith('public/') || file.startsWith('dist-web/')) {
  // A serialized cycle/results document has no place in the shipped shell.
  if (/"kind"\s*:\s*"(?:cycle|cycle-bundle|results)"/.test(text) || /fixture-six-week-cycle|Synthetic fixture/.test(text)) findings.push(file);
 }
}
if (findings.length) { console.error('Privacy scan failed:', [...new Set(findings)].join(', ')); process.exitCode=1; }
else console.log(`Privacy scan passed for ${files.length} source and deployment files. No private paths, credential signatures, or bundled cycle/results data.`);
