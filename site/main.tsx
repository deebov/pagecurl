import { createRoot, hydrateRoot } from 'react-dom/client';
import { App } from './app';
import { platformOf } from './platform';

// The built page arrives already rendered (scripts/build-page.ts), so React takes over that HTML.
// In development the root is empty and React renders it from scratch.
const root = document.getElementById('root') as HTMLElement;
const app = <App platform={platformOf(location.pathname)} />;
if (root.firstElementChild) hydrateRoot(root, app);
else createRoot(root).render(app);
