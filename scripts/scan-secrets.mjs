import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const patterns = [
  /AKIA[0-9A-Z]{16}/,
  /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{40,}/,
  /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
];
const localSecrets = [];
for (const file of ['nestjs-project/.env', 'next-frontend/.env', 'next-frontend/.env.local']) {
  if (!existsSync(resolve(root, file))) continue;
  for (const line of readFileSync(resolve(root, file), 'utf8').split(/\r?\n/)) {
    const match = line.match(/^(\w*(?:SECRET|PASSWORD|TOKEN|API_KEY)\w*)=(.+)$/);
    if (match) {
      const value = match[2].replace(/^["']|["']$/g, '');
      if (value.length >= 20) localSecrets.push(value);
    }
  }
}
const findings = new Set();
const scan = (name, text) => {
  if (patterns.some((pattern) => pattern.test(text)) || localSecrets.some((secret) => text.includes(secret))) findings.add(name);
};
const files = git('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(Boolean);
for (const file of new Set(files)) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.example')) findings.add(`${file} (arquivo de ambiente rastreado)`);
  if (file === '.mcp.json' || /\.(pem|key|p12|pfx)$/.test(file)) findings.add(`${file} (arquivo local sensível rastreado)`);
  if (existsSync(resolve(root, file))) scan(file, readFileSync(resolve(root, file), 'utf8'));
}
if (process.argv.includes('--history')) {
  const objects = git('rev-list', '--objects', '--all').split('\n').filter(Boolean);
  for (const line of objects) {
    const [sha, ...path] = line.split(' ');
    if (!path.length || git('cat-file', '-t', sha).trim() !== 'blob') continue;
    scan(`history:${sha.slice(0, 12)}:${path.join(' ')}`, git('cat-file', 'blob', sha));
  }
}
if (findings.size) {
  console.error('Possíveis segredos/arquivos sensíveis (valores omitidos):\n' + [...findings].join('\n'));
  process.exitCode = 1;
} else console.log(`Verificação sem achados em ${new Set(files).size} arquivos${process.argv.includes('--history') ? ' e histórico Git' : ''}. Heurística: revisar o diff também.`);
