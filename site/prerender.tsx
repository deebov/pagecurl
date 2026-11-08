// Called by scripts/build-page.ts with the built page. Renders the site into it, so search engines
// and link previews get the whole page as HTML before any script runs, and writes the files
// crawlers look for. The canonical URL in index.html is the one place the site's address is set.
import { join } from 'node:path';
import { renderToString } from 'react-dom/server';
import { App } from './app';
import { PLATFORMS, type Platform } from './platform';

// Files in public/, which the bundler can't see, so they're linked once the page is built.
const ICONS = [
  '<link rel="icon" href="/favicon.ico" sizes="32x32">',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
  '<link rel="manifest" href="/site.webmanifest">',
].join('');

export default async function prerender(html: string, out: string): Promise<string> {
  const url = /<link rel="canonical" href="([^"]+)"/.exec(html)?.[1];
  if (!url) throw new Error('site/index.html needs a canonical link');
  const today = new Date().toISOString().slice(0, 10);
  const urls = Object.values(PLATFORMS).map((p) => new URL(p.path, url).href);
  await Bun.write(
    join(out, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${u}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`,
  );
  await Bun.write(
    join(out, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${url}sitemap.xml\n`,
  );
  return renderPage(html, 'web');
}

/** Renders the page with the docs for `platform` into the built HTML. */
export function renderPage(html: string, platform: Platform): string {
  const body = renderToString(<App platform={platform} />);
  const faq = JSON.stringify({ '@context': 'https://schema.org', ...faqPage(body) }).replaceAll(
    '<',
    '\\u003c',
  );
  // The last </head>, as the inlined script, still in the head, holds code samples with their own.
  const end = html.lastIndexOf('</head>');
  html = `${html.slice(0, end)}${ICONS}<script type="application/ld+json">${faq}</script>${html.slice(end)}`;

  // The script comes after the page, so the page shows while the script is still downloading.
  const script = /<script type="module">[\s\S]*?<\/script>/.exec(html)?.[0] ?? '';
  html = html.replace(script, '');
  return html.replace('<div id="root"></div>', () => `<div id="root">${body}</div>${script}`);
}

/** The FAQ section's questions and answers as schema.org data, read from the rendered page. */
function faqPage(body: string) {
  const section = /<section[^>]*id="faq"[^>]*>([\s\S]*?)<\/section>/.exec(body)?.[1] ?? '';
  const topics = section.split('<div class="topic"').slice(1);
  return {
    '@type': 'FAQPage',
    mainEntity: topics.map((topic) => {
      const [question = '', answer = ''] = topic.split('</h3>');
      return {
        '@type': 'Question',
        name: plainText(question.replace(/^[^>]*>/, '')),
        acceptedAnswer: {
          '@type': 'Answer',
          text: plainText(answer.replace(/<figure[\s\S]*?<\/figure>/g, ' ')),
        },
      };
    }),
  };
}

function plainText(html: string): string {
  return html
    .replace(/<\/(p|li)>/g, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}
