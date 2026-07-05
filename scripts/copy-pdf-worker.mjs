// Copies the pdf.js worker into public/ so the in-app PDF editor can load it
// without bundler-specific worker handling.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source = path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
const target = path.join(root, 'public', 'pdf.worker.min.mjs');

if (!fs.existsSync(source)) {
  console.warn('[casepoint] pdfjs-dist worker not found; run npm install first.');
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('[casepoint] pdf.js worker copied to public/pdf.worker.min.mjs');
