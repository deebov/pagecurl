import { createRoot } from 'react-dom/client';
import { Demo } from '../demo';

// The demo book alone, filling the screen, to open on a phone or in a simulator and record. On a
// dark desk by default; /play?light puts it on the site's light background.
if (new URLSearchParams(location.search).has('light')) document.body.classList.add('light');
createRoot(document.getElementById('root') as HTMLElement).render(<Demo fill />);
