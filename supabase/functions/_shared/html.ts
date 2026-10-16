// Legge da una pagina HTML i "metadati pubblici": quelli che i siti espongono apposta
// per le anteprime (Open Graph, Twitter Card, <title>, meta description) e,
// se c'è, la scheda Ricetta in formato schema.org (JSON-LD) usata da Google.

export type PageMetadata = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  author: string | null;
  /** Scheda schema.org/Recipe trovata nella pagina (utile per l'estrazione AI). */
  recipeJsonLd: Record<string, unknown> | null;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  egrave: 'è',
  eacute: 'é',
  agrave: 'à',
  ograve: 'ò',
  ugrave: 'ù',
  igrave: 'ì',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  deg: '°',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      try {
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      } catch {
        return match;
      }
    }
    return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
  });
}

function clean(value: string | null | undefined, maxLength = 5000): string | null {
  if (!value) return null;
  const text = decodeEntities(value).replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, maxLength) : null;
}

/** Legge gli attributi di un tag, es. <meta property="og:title" content="…"> → {property, content}. */
function parseAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([a-zA-Z_:.-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tag))) attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? '';
  return attrs;
}

function absolutize(url: string | null, baseUrl: string): string | null {
  if (!url) return null;
  try {
    const abs = new URL(decodeEntities(url.trim()), baseUrl);
    return abs.protocol === 'http:' || abs.protocol === 'https:' ? abs.href : null;
  } catch {
    return null;
  }
}

/** Cerca, anche dentro @graph o array, il primo oggetto JSON-LD di tipo Recipe. */
export function findRecipeJsonLd(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const [, raw] of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(raw.trim());
    } catch {
      continue;
    }
    const found = searchRecipe(data, 0);
    if (found) return found;
  }
  return null;
}

function searchRecipe(node: unknown, depth: number): Record<string, unknown> | null {
  if (!node || typeof node !== 'object' || depth > 5) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = searchRecipe(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  const type = obj['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return obj;
  return searchRecipe(obj['@graph'], depth + 1);
}

function jsonLdImage(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === 'string') return image;
  if (Array.isArray(image)) return jsonLdImage(image[0]);
  if (typeof image === 'object') return (image as { url?: string }).url ?? null;
  return null;
}

function jsonLdAuthor(author: unknown): string | null {
  if (!author) return null;
  if (typeof author === 'string') return author;
  if (Array.isArray(author)) return jsonLdAuthor(author[0]);
  if (typeof author === 'object') return (author as { name?: string }).name ?? null;
  return null;
}

export function parseHtmlMetadata(html: string, pageUrl: string): PageMetadata {
  const head = html.slice(0, 600_000); // basta l'inizio della pagina, evita lavoro inutile
  const meta: Record<string, string> = {};
  for (const [tag] of head.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = parseAttributes(tag);
    const key = (attrs.property ?? attrs.name ?? attrs.itemprop ?? '').toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
  }
  const titleTag = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? null;
  const recipe = findRecipeJsonLd(head);

  return {
    title: clean(meta['og:title'] ?? meta['twitter:title'] ?? (recipe?.name as string | undefined) ?? titleTag, 300),
    description: clean(
      meta['og:description'] ?? meta['twitter:description'] ?? meta['description'] ??
        (recipe?.description as string | undefined),
    ),
    imageUrl: absolutize(
      meta['og:image:secure_url'] ?? meta['og:image'] ?? meta['twitter:image'] ?? meta['twitter:image:src'] ??
        jsonLdImage(recipe?.image),
      pageUrl,
    ),
    siteName: clean(meta['og:site_name'], 100),
    author: clean(meta['author'] ?? meta['article:author'] ?? jsonLdAuthor(recipe?.author), 200),
    recipeJsonLd: recipe,
  };
}
