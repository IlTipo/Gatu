// "Cosa aggiungeresti?": il consiglio arriva per email al proprietario di Morso (servizio Resend).
// Senza RESEND_API_KEY / FEEDBACK_EMAIL il consiglio resta solo salvato nella tabella "feedback".

import type { FetchLike } from './metadata.ts';

export const MIN_FEEDBACK = 3;
export const MAX_FEEDBACK = 1000;

export type Mail = { subject: string; text: string; replyTo?: string | null };
export type Mailer = (mail: Mail) => Promise<boolean>;

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

/** Email semplice (solo testo, niente HTML): oggetto su una riga, risposta diretta a chi scrive. */
export function feedbackMail(input: { message: string; name: string | null; email: string | null }): Mail {
  const who = oneLine(input.name || input.email || 'un utente').slice(0, 60);
  return {
    subject: oneLine(`💡 Morso: consiglio da ${who}`),
    text: [
      `Nuovo consiglio su cosa aggiungere a Morso.`,
      ``,
      `Da: ${input.name ?? '—'} <${input.email ?? 'email non disponibile'}>`,
      ``,
      input.message,
      ``,
      `— Puoi rispondere direttamente a questa email.`,
    ].join('\n'),
    replyTo: input.email && /^[^\s@<>]+@[^\s@<>]+$/.test(input.email) ? input.email : null,
  };
}

export function createResendMailer(apiKey: string, to: string, fetchFn: FetchLike, from = 'Morso <onboarding@resend.dev>'): Mailer {
  return async (mail) => {
    try {
      const res = await fetchFn('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to],
          subject: mail.subject,
          text: mail.text,
          ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) console.error('feedback email failed', res.status);
      return res.ok;
    } catch (e) {
      console.error('feedback email failed', e);
      return false;
    }
  };
}

/** Email per un commento segnalato (solo testo). */
export function reportMail(input: { body: string; author: string | null; reporter: string | null; reason: string }): Mail {
  return {
    subject: oneLine(`🚩 Morso: commento segnalato di @${input.author ?? '?'}`).slice(0, 120),
    text: [
      `Un commento è stato segnalato su Morso.`,
      ``,
      `Scritto da: @${input.author ?? '?'}`,
      `Segnalato da: @${input.reporter ?? '?'}`,
      `Motivo: ${input.reason || '—'}`,
      ``,
      `Commento:`,
      input.body,
      ``,
      `Puoi cancellarlo da Supabase → Table editor → recipe_comments.`,
    ].join('\n'),
  };
}
