import { useState } from 'react';
import { highlighted } from './highlight' with { type: 'macro' };
import { SNIPPETS, type SnippetId } from './snippets';

// The macro's promise is resolved at build time, so the bundle holds the value itself.
const LINES = highlighted() as unknown as Awaited<ReturnType<typeof highlighted>>;

type CodeProps = { id: SnippetId } | { tabs: [label: string, id: SnippetId][] };

/** A code sample in a little window. With `tabs`, the title bar switches between samples. */
export function Code(props: CodeProps) {
  const tabs = 'tabs' in props ? props.tabs : null;
  const [active, setActive] = useState(0);
  const id = tabs ? (tabs[active]?.[1] ?? tabs[0][1]) : (props as { id: SnippetId }).id;
  const snippet = SNIPPETS[id];

  return (
    <figure className="code-card">
      <figcaption className="code-bar">
        {tabs ? (
          <span className="code-tabs" role="tablist">
            {tabs.map(([label], i) => (
              <button
                type="button"
                role="tab"
                key={label}
                aria-selected={i === active}
                onClick={() => setActive(i)}
              >
                {label}
              </button>
            ))}
          </span>
        ) : (
          <span className="code-title">{snippet.title}</span>
        )}
        <CopyButton text={snippet.code} />
      </figcaption>
      <div className="code-screen">
        <pre>
          <code>
            {LINES[id].map((line, n) => (
              <span className="code-line" key={n}>
                {snippet.lang === 'bash' && <span className="code-prompt">$ </span>}
                {line.map((token, k) => (
                  <span
                    key={k}
                    style={{ color: token.c, fontStyle: token.i ? 'italic' : undefined }}
                  >
                    {token.t}
                  </span>
                ))}
                {'\n'}
              </span>
            ))}
          </code>
        </pre>
      </div>
    </figure>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="code-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1400);
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}
