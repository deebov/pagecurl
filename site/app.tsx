import { type MouseEvent, useEffect, useState } from 'react';
import { Code } from './code';
import { Demo } from './demo';
import { Faq, Guides, Reference } from './docs';
import { PLATFORMS, type Platform, platformOf } from './platform';

const GITHUB = 'https://github.com/deebov/pagecurl';
const TWITTER = 'https://x.com/deebovv';

/** The landing page, with the docs for `platform`. The switch above the docs flips between the
 * web and React Native docs in place and moves the address with it. */
export function App({ platform: initial }: { platform: Platform }) {
  const [platform, setPlatform] = useState(initial);

  useEffect(() => {
    const onPop = () => setPlatform(platformOf(location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    document.title = PLATFORMS[platform].title;
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = new URL(PLATFORMS[platform].path, canonical.href).href;
  }, [platform]);

  const choose = (next: Platform) => (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    if (next === platform) return;
    history.pushState(null, '', PLATFORMS[next].path + location.hash);
    setPlatform(next);
  };

  return (
    <>
      <nav className="nav">
        <a className="wordmark" href="#top">
          <Logo />
          pagecurl
        </a>
        <div className="links">
          <a className="text-link" href="#docs">
            Docs
          </a>
          <a className="text-link" href="#api">
            API
          </a>
          <a className="text-link" href="#faq">
            FAQ
          </a>
          <a href={GITHUB} aria-label="GitHub">
            <GitHubIcon />
          </a>
          <a href={TWITTER} aria-label="Twitter">
            <XIcon />
          </a>
        </div>
      </nav>

      <main id="top">
        <header className="hero">
          <h1>Turn the page.</h1>
          <p className="subtitle">
            {platform === 'native'
              ? 'A realistic page curl for React Native. Drag a corner, tap an edge, or turn it from code. On iOS and Android, drawn with Skia.'
              : 'A realistic page curl for any HTML. Drag a corner, tap an edge, or turn it from code. For React, React Native or plain JavaScript.'}
          </p>
        </header>

        <Demo />

        <section className="stats" aria-label="At a glance">
          {platform === 'native' ? (
            <>
              <Stat value="16 kB" label="min + gzip" />
              <Stat value="1" label="peer dependency, Skia" />
              <Stat value="2" label="platforms, iOS and Android" />
            </>
          ) : (
            <>
              <Stat value="20 kB" label="min + gzip" />
              <Stat value="0" label="dependencies, React is a peer" />
              <Stat value="WebGL" label="drawn on the GPU" />
            </>
          )}
        </section>

        <nav className="platforms" aria-label="Docs for">
          <span className="platforms-switch">
            {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
              <a
                key={p}
                href={PLATFORMS[p].path}
                aria-current={p === platform ? 'page' : undefined}
                onClick={choose(p)}
              >
                {PLATFORMS[p].label}
              </a>
            ))}
          </span>
        </nav>

        {platform === 'native' ? (
          <>
            <section className="section">
              <h2>Installation</h2>
              <Code id="installNative" />
              <p className="note">
                Skia is the one peer dependency. It's built into Expo Go, so the book runs there as
                it is.
              </p>
            </section>

            <section className="section">
              <h2>Usage</h2>
              <p>Every child is a page. Give the book a size, and that's it.</p>
              <Code id="nativeUsage" />
              <p>Turn pages from anywhere: buttons, timers, your own gestures.</p>
              <Code id="nativeApi" />
            </section>
          </>
        ) : (
          <>
            <section className="section">
              <h2>Installation</h2>
              <Code id="installReact" />
              <p className="note">Not using React?</p>
              <Code id="installCore" />
            </section>

            <section className="section">
              <h2>Usage</h2>
              <p>Every child is a page. Give the book a size, and that's it.</p>
              <Code
                tabs={[
                  ['React', 'reactUsage'],
                  ['JavaScript', 'vanillaUsage'],
                ]}
              />
              <p>Turn pages from anywhere: buttons, keys, timers, your own gestures.</p>
              <Code id="reactApi" />
            </section>
          </>
        )}

        <Guides platform={platform} />
        <Reference platform={platform} />
        <Faq platform={platform} />
      </main>

      <footer className="footer">
        <span>Made by Dilshod</span>
        <a href={GITHUB}>GitHub</a>
        <a href={TWITTER}>Twitter</a>
      </footer>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 3h10l4 4v14H5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M15 3v4h4"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.36-3.87-1.36-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.7 5.38-5.27 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17.75 3h3.07l-6.7 7.66L22 21h-6.17l-4.83-6.32L5.47 21H2.4l7.17-8.2L2 3h6.33l4.37 5.78L17.75 3Zm-1.08 16.18h1.7L7.4 4.73H5.58l11.09 14.45Z"
      />
    </svg>
  );
}
