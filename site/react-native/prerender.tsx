// Called by scripts/build-page.ts with the built page: the landing page with the React Native docs.
import { renderPage } from '../prerender';

export default async function prerender(html: string): Promise<string> {
  return renderPage(html, 'native');
}
