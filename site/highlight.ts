// A Bun macro: it runs while the page is bundled, so the page ships coloured tokens and no
// highlighter. Import it with `with { type: 'macro' }`.
import { codeToTokens } from 'shiki';
import { SNIPPETS, type SnippetId } from './snippets';

export const THEME = 'github-light';

/** One run of text in one colour. `i` marks italics. */
export interface Token {
  t: string;
  c?: string;
  i?: true;
}

export async function highlighted(): Promise<Record<SnippetId, Token[][]>> {
  const out = {} as Record<SnippetId, Token[][]>;
  for (const [id, { lang, code }] of Object.entries(SNIPPETS)) {
    const { tokens } = await codeToTokens(code, { lang, theme: THEME });
    out[id as SnippetId] = tokens.map((line) =>
      line.map((token) => ({
        t: token.content,
        ...(token.color && { c: token.color }),
        ...((token.fontStyle ?? 0) & 1 ? { i: true as const } : {}),
      })),
    );
  }
  return out;
}
