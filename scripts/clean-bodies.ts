/**
 * One-off cleanup: strip stray HTML comments (e.g. provenance markers an agent
 * embedded) from existing article bodies, and recover any provenance JSON from
 * those comments into the proper `source` field.
 *
 * Run: API_BASE_URL=https://api.globalworldjournal.com ADMIN_USERNAME=nate \
 *      ADMIN_PASSWORD=… bun run scripts/clean-bodies.ts
 */
const API = (process.env.API_BASE_URL ?? '').replace(/\/$/, '');
const USER = process.env.ADMIN_USERNAME ?? '';
const PASS = process.env.ADMIN_PASSWORD ?? '';
if (!API || !USER || !PASS) {
  process.stderr.write('Missing API_BASE_URL / ADMIN_USERNAME / ADMIN_PASSWORD\n');
  process.exit(1);
}

interface Source {
  name?: string;
  articleUrl?: string;
  imageUrl?: string;
}
interface Article {
  id: string;
  title: string;
  body: string;
  source?: Source;
}

function provenanceFromComments(body: string): Source | undefined {
  for (const m of body.matchAll(/<!--\s*provenance:\s*(\{[\s\S]*?\})\s*-->/g)) {
    try {
      const parsed = JSON.parse(m[1] ?? '') as Source;
      if (parsed && (parsed.name || parsed.articleUrl || parsed.imageUrl)) return parsed;
    } catch {
      // not valid JSON; ignore and keep scanning
    }
  }
  return undefined;
}

function stripComments(body: string): string {
  return body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
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

  const listed = (await (
    await fetch(`${API}/api/admin/articles?limit=50`, { headers: auth })
  ).json()) as { data: Article[] };

  let cleaned = 0;
  for (const a of listed.data) {
    if (!a.body.includes('<!--')) continue;
    const patch: { body: string; source?: Source } = { body: stripComments(a.body) };
    const recovered = provenanceFromComments(a.body);
    if (recovered && !a.source?.articleUrl) patch.source = recovered;
    const res = await fetch(`${API}/api/admin/articles/${a.id}`, {
      method: 'PATCH',
      headers: auth,
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      cleaned += 1;
      process.stdout.write(`cleaned${patch.source ? ' (+source)' : ''}: ${a.title.slice(0, 55)}\n`);
    } else {
      process.stderr.write(`patch failed ${a.id}: ${res.status} ${await res.text()}\n`);
    }
  }
  process.stdout.write(`\ndone: ${cleaned} article(s) cleaned\n`);
}

await main();
