// Prova a mano con l'AI vera: lettura di una nota della spesa (stampa il risultato o l'errore).
import { createGeminiRecipeTools } from '../_shared/gemini.ts';

const key = Deno.env.get('GEMINI_API_KEY');
if (!key) throw new Error('GEMINI_API_KEY mancante');
const bytes = await Deno.readFile(new URL('./nota-spesa.jpg', import.meta.url));
let s = '';
for (const b of bytes) s += String.fromCharCode(b);
const tools = createGeminiRecipeTools(key, {});
const started = Date.now();
const out = await tools.shoppingScan({ mimeType: 'image/jpeg', data: btoa(s) });
console.log('secondi', (Date.now() - started) / 1000);
console.log(JSON.stringify(out, null, 2).slice(0, 2000));
const fridge = await tools.fridgeScan({ mimeType: 'image/jpeg', data: btoa(s) });
console.log('frigo', JSON.stringify(fridge).slice(0, 400));
