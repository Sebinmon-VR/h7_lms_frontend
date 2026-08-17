/**
 * Renders the legal documents to static HTML in `public/legal/`.
 *
 * This repo owns the text. The mobile app links to the pages this produces
 * rather than bundling its own copy, so there is exactly one place a policy is
 * edited and no way for the two to disagree.
 *
 * Deliberately plain, self-contained HTML — no framework, no fonts, no scripts.
 * These URLs are read by app-store reviewers, and a policy page that depends on
 * a JS bundle is one that can fail to load for the one visitor who matters.
 * Being real files under `public/` also means Azure serves them directly rather
 * than through the SPA fallback — see the `/legal/*` exclude in
 * `staticwebapp.config.json`, without which these paths silently render the app.
 *
 *   npm run legal
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  HOSTED_PAGES,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_ENTITY,
  LEGAL_VERSION,
  unfilledPlaceholders,
} from './legal/documents.ts'

const unfilled = unfilledPlaceholders()
if (unfilled.length > 0) {
  console.error(
    `Refusing to render: LEGAL_ENTITY still has placeholders — ${unfilled.join(', ')}.\n` +
      'These would be published at the URL a store reviewer reads. Fill them in first.',
  )
  process.exit(1)
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'legal')
mkdirSync(outDir, { recursive: true })

/** The source is ours, but an unescaped ampersand is still a bug. */
const esc = (s) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const NAV = HOSTED_PAGES.map((pg) => ({ slug: pg.slug, title: pg.title }))

function renderHtml(page) {
  const body = page.sections
    .map((section) => {
      const blocks = section.blocks
        .map((block) =>
          block.type === 'p'
            ? `<p>${esc(block.text)}</p>`
            : `<ul>${block.items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`,
        )
        .join('\n        ')
      return `      <section>\n        <h2>${esc(section.heading)}</h2>\n        ${blocks}\n      </section>`
    })
    .join('\n')

  const nav = NAV.map((n) =>
    n.slug === page.slug
      ? `<span aria-current="page">${esc(n.title)}</span>`
      : `<a href="./${n.slug}.html">${esc(n.title)}</a>`,
  ).join('\n        ')

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)} · H7 EdTech</title>
<meta name="description" content="${esc(page.summary)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>
  :root {
    --bg: #fbfafd; --ink: #14121f; --soft: #4a4761;
    --faint: #7c7896; --rule: #e3e1ec; --accent: #4338ca;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #100e18; --ink: #efedf6; --soft: #b4afc9;
      --faint: #8681a0; --rule: #2c2942; --accent: #a99cf7;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.65 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 5rem; }
  header { border-bottom: 2px solid var(--rule); padding-bottom: 1.5rem; }
  .brand { font-size: .74rem; font-weight: 700; letter-spacing: .13em; text-transform: uppercase; color: var(--accent); margin: 0 0 .75rem; }
  h1 { font: 600 clamp(1.75rem, 5vw, 2.4rem)/1.15 Georgia, "Times New Roman", serif; margin: 0; letter-spacing: -.02em; }
  .summary { color: var(--soft); margin: .85rem 0 0; }
  .meta { color: var(--faint); font-size: .82rem; margin: 1.1rem 0 0; }
  nav { display: flex; flex-wrap: wrap; gap: .5rem 1.25rem; margin-top: 1.25rem; font-size: .85rem; }
  nav a { color: var(--accent); }
  nav [aria-current] { color: var(--faint); font-weight: 600; }
  section { margin-top: 2.5rem; }
  h2 { font: 600 1.3rem/1.3 Georgia, "Times New Roman", serif; margin: 0 0 .7rem; letter-spacing: -.01em; text-wrap: balance; }
  p { margin: 0 0 .85rem; }
  ul { margin: 0 0 .85rem; padding-left: 1.15rem; }
  li { margin-bottom: .5rem; }
  p, li { color: var(--soft); }
  footer { margin-top: 3.5rem; padding-top: 1.25rem; border-top: 1px solid var(--rule); color: var(--faint); font-size: .82rem; }
  a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 2px; }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <p class="brand">H7 EdTech</p>
      <h1>${esc(page.title)}</h1>
      <p class="summary">${esc(page.summary)}</p>
      <p class="meta">Version ${esc(LEGAL_VERSION)} · Effective ${esc(LEGAL_EFFECTIVE_DATE)}</p>
      <nav>
        ${nav}
      </nav>
    </header>

${body}

    <footer>
      ${esc(LEGAL_ENTITY.processor)} · ${esc(LEGAL_ENTITY.processorAddress)}<br>
      Contact: <a href="mailto:${esc(LEGAL_ENTITY.privacyEmail)}">${esc(LEGAL_ENTITY.privacyEmail)}</a>
    </footer>
  </div>
</body>
</html>
`
}

for (const page of HOSTED_PAGES) {
  const file = join(outDir, `${page.slug}.html`)
  writeFileSync(file, renderHtml(page), 'utf8')
  console.log(`wrote public/legal/${page.slug}.html`)
}

console.log(`\nVersion ${LEGAL_VERSION} — keep LEGAL_VERSION in the mobile app in step.`)
