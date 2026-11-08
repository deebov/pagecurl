// Called by scripts/build-page.ts with the built page. Links the files in site/public, which the
// bundler can't resolve from here.
const LINKS = [
  '<link rel="manifest" href="/play.webmanifest" />',
  '<link rel="icon" href="/favicon.svg" type="image/svg+xml" />',
  '<link rel="apple-touch-icon" href="/apple-touch-icon.png" />',
].join('');

export default async function prerender(html: string): Promise<string> {
  // the last one: the bundled scripts sit in the head and can contain the text '</head>'
  const head = html.lastIndexOf('</head>');
  return html.slice(0, head) + LINKS + html.slice(head);
}
