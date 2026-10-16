// Legge il risultato del login dal link con cui Supabase riapre l'app,
// ad esempio: morso://auth/callback?code=abc  oppure  ...#error=access_denied&error_description=...

export type AuthCallbackResult =
  | { kind: 'code'; code: string }
  | { kind: 'error'; message: string }
  | { kind: 'empty' };

export function parseAuthCallback(url: string): AuthCallbackResult {
  const params = new Map<string, string>();
  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');
  const parts: string[] = [];
  if (queryStart !== -1) parts.push(url.slice(queryStart + 1, hashStart > queryStart ? hashStart : undefined));
  if (hashStart !== -1) parts.push(url.slice(hashStart + 1));

  for (const part of parts) {
    for (const pair of part.split('&')) {
      if (!pair) continue;
      const [rawKey, ...rest] = pair.split('=');
      const decode = (s: string) => {
        try {
          return decodeURIComponent(s.replace(/\+/g, ' '));
        } catch {
          return s;
        }
      };
      params.set(decode(rawKey), decode(rest.join('=')));
    }
  }

  const error = params.get('error_description') || params.get('error');
  if (error) return { kind: 'error', message: error };
  const code = params.get('code');
  if (code) return { kind: 'code', code };
  return { kind: 'empty' };
}
