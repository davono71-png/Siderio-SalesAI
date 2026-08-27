import fs from 'node:fs';
import { SalesAiOutputSchema } from '../lib/sales-ai/schema.js';

const sample = JSON.parse(fs.readFileSync(new URL('../examples/sample-ai-output.json', import.meta.url), 'utf8'));
const parsed = SalesAiOutputSchema.parse(sample);

if (!parsed || parsed.classification !== 'EXISTING_OPPORTUNITY') {
  throw new Error('Verifica schema fallita');
}

const required = [
  '../prompts/backend-analysis-v1.1.txt',
  '../prompts/n8n-email-engine-v1.1.txt',
  '../supabase/migrations/20260827160000_sales_ai_v1_schema.sql',
];
for (const relative of required) {
  const url = new URL(relative, import.meta.url);
  if (!fs.existsSync(url)) throw new Error(`File mancante: ${relative}`);
}

console.log('OK - starter kit coerente: schema V1.1 + file principali presenti.');
