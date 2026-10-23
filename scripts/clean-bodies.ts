/**
 * One-off cleanup of existing article bodies: strips stray HTML comments, any
 * source-list section ("## Sources", "## Fuentes", "**Sources:** …") and any
 * short paragraph saying how the piece was written ("written with AI", …).
 * Bodies are the reader-facing prose; none of that belongs in them.
 *
 * Run with --dry-run first to review every change:
 *   API_BASE_URL=https://api.globalworldjournal.com ADMIN_USERNAME=nate \
 *   ADMIN_PASSWORD=… bun run scripts/clean-bodies.ts --dry-run
 */
const API = (process.env.API_BASE_URL ?? '').replace(/\/$/, '');
const USER = process.env.ADMIN_USERNAME ?? '';
const PASS = process.env.ADMIN_PASSWORD ?? '';
if (!API || !USER || !PASS) {
  process.stderr.write('Missing API_BASE_URL / ADMIN_USERNAME / ADMIN_PASSWORD\n');
  process.exit(1);
}
const DRY_RUN = process.argv.includes('--dry-run');
/** The admin list endpoint's largest page. */
const PAGE_SIZE = 50;
/** A paragraph longer than this is reporting (e.g. a story about AI), not a disclosure line. */
const MAX_DISCLOSURE_LENGTH = 300;

interface Article {
  id: string;
  title: string;
  body: string;
}
interface Page {
  data: Article[];
  pagination: { totalPages: number };
}

const SOURCES_LABEL = String.raw`(?:sources?|fuentes|r[ée]f[ée]rences|references|sources et r[ée]f[ée]rences)`;
/** A heading naming a source list; the section runs to the next heading or the end. */
const SOURCES_HEADING = new RegExp(String.raw`^#{1,6}\s*${SOURCES_LABEL}\s*:?\s*$`, 'i');
/** A paragraph that IS a source list: "Sources: …" / "**Fuentes:** …". */
const SOURCES_PARAGRAPH = new RegExp(String.raw`^\**_?${SOURCES_LABEL}\s*:`, 'i');
const AI_DISCLOSURE =
  /\b(?:written|generated|produced|drafted|created)\s+(?:with|by|using)\s+(?:the\s+help\s+of\s+)?(?:an?\s+)?(?:AI|artificial intelligence|language model)\b|\b(?:redactad|generad|elaborad|escrit|producid)[oa]s?\s+(?:con|por|mediante)\s+(?:ayuda\s+de\s+)?(?:la\s+|una\s+)?(?:IA|inteligencia artificial)\b|\b(?:rédigé|généré|écrit|produit)e?s?\s+(?:avec|par)\s+(?:l['’]aide\s+de\s+)?(?:l['’]|une\s+)?(?:IA|intelligence artificielle)\b/i;

function blocks(body: string): string[] {
  return body
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

export function cleanBody(body: string): string {
  const kept: string[] = [];
  let inSources = false;
  for (const text of blocks(body.replace(/<!--[\s\S]*?-->/g, ''))) {
    if (/^#{1,6}\s/.test(text)) inSources = SOURCES_HEADING.test(text);
    if (inSources || SOURCES_PARAGRAPH.test(text)) continue;
    if (text.length <= MAX_DISCLOSURE_LENGTH && AI_DISCLOSURE.test(text)) continue;
    kept.push(text);
  }
  return kept.join('\n\n');
}

async function main(): Promise<void> {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) {
    process.stderr.write(`login failed: ${login.status}\n`);
    process.exit(1);
  }
  const { token } = (await login.json()) as { token: string };
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  let cleaned = 0;
  let totalPages = 1;
  for (let page = 1; page <= totalPages; page += 1) {
    const res = await fetch(`${API}/api/admin/articles?limit=${PAGE_SIZE}&page=${page}`, {
      headers: auth,
    });
    if (!res.ok) {
      process.stderr.write(`list failed (page ${page}): ${res.status}\n`);
      process.exit(1);
    }
    const listed = (await res.json()) as Page;
    totalPages = listed.pagination.totalPages;
    for (const a of listed.data) {
      const body = cleanBody(a.body);
      if (body === blocks(a.body).join('\n\n')) continue;
      cleaned += 1;
      process.stdout.write(`${DRY_RUN ? 'would clean' : 'cleaned'}: ${a.id} ${a.title}\n`);
      if (DRY_RUN) {
        const removed = blocks(a.body).filter((b) => !body.includes(b));
        for (const b of removed) process.stdout.write(`  - ${b.slice(0, 160)}\n`);
        continue;
      }
      const patched = await fetch(`${API}/api/admin/articles/${a.id}`, {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ body }),
      });
      if (!patched.ok) {
        process.stderr.write(`patch failed ${a.id}: ${patched.status} ${await patched.text()}\n`);
      }
    }
  }
  process.stdout.write(`\ndone: ${cleaned} article(s) ${DRY_RUN ? 'to clean' : 'cleaned'}\n`);
}

if (import.meta.main) await main();
