import { assertEquals } from 'jsr:@std/assert@1';

import { createResendMailer, feedbackMail } from '../_shared/mail.ts';

Deno.test('email del consiglio: niente a capo nell\'oggetto, risposta solo a email valide', () => {
  const m = feedbackMail({ message: 'ciao', name: null, email: 'bad email\r\nBcc: x@y.z' });
  assertEquals(m.subject.includes('\n'), false);
  assertEquals(m.replyTo, null);
  assertEquals(feedbackMail({ message: 'ciao', name: 'Bruno', email: 'b@example.com' }).replyTo, 'b@example.com');
});

Deno.test('Resend: chiamata giusta, errori non fanno cadere niente', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const ok = createResendMailer('re_key', 'me@example.com', (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response('{}', { status: 200 }));
  });
  assertEquals(await ok({ subject: 'S', text: 'T', replyTo: 'a@b.c' }), true);
  assertEquals(calls[0].url, 'https://api.resend.com/emails');
  const body = JSON.parse(String(calls[0].init?.body));
  assertEquals(body.to, ['me@example.com']);
  assertEquals(body.reply_to, 'a@b.c');
  assertEquals((calls[0].init?.headers as Record<string, string>).authorization, 'Bearer re_key');
  const down = createResendMailer('k', 'me@example.com', () => Promise.reject(new Error('offline')));
  assertEquals(await down({ subject: 'S', text: 'T' }), false);
});
