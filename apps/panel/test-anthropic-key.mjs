// Test temporal — leer key desde .env.local del panel y hacer una llamada Haiku
// mínima para validar credenciales antes de que Iván reinicie el dev server.
import { readFileSync, unlinkSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

const env = readFileSync(new URL('./.env.local', import.meta.url), 'utf8');
const match = env.match(/^ANTHROPIC_API_KEY=(.+)$/m);
if (!match) {
  console.error('NO ANTHROPIC_API_KEY en .env.local');
  process.exit(1);
}
const apiKey = match[1].trim();

const client = new Anthropic({ apiKey });
try {
  const r = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 50,
    system:
      'Eres un setter que escribe followups personalizados. Devuelve solo el mensaje, sin explicaciones.',
    messages: [
      {
        role: 'user',
        content:
          'Lead: Carlos. Conv: tiene academia de fitness, 80 alumnos, quiere 200, solo Instagram orgánico. Genera un followup natural en castellano.',
      },
    ],
  });
  const text = r.content.find((b) => b.type === 'text')?.text ?? '(sin texto)';
  console.log('OK API key válida.');
  console.log('Mensaje generado:');
  console.log(text);
  console.log('Tokens in/out:', r.usage.input_tokens, '/', r.usage.output_tokens);
} catch (e) {
  console.error('ERROR:', e.message);
  process.exit(1);
}
