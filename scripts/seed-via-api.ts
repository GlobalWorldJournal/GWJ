/**
 * Seed demo articles into a LIVE GWJ backend over its public HTTP API (no DB
 * access needed). Logs in as the admin, then creates + publishes each demo
 * article. Idempotent: skips an article whose slug already exists.
 *
 * Env: API_BASE_URL, ADMIN_USERNAME, ADMIN_PASSWORD.
 * Run: API_BASE_URL=https://api.globalworldjournal.com ADMIN_USERNAME=nate \
 *      ADMIN_PASSWORD=... bun run scripts/seed-via-api.ts
 */
import { slugify } from '@gwj/shared-types';

const API = (process.env.API_BASE_URL ?? '').replace(/\/$/, '');
const USER = process.env.ADMIN_USERNAME ?? '';
const PASS = process.env.ADMIN_PASSWORD ?? '';
if (!API || !USER || !PASS) {
  process.stderr.write('Missing API_BASE_URL / ADMIN_USERNAME / ADMIN_PASSWORD\n');
  process.exit(1);
}

const hero = (seed: string) => ({
  url: `https://picsum.photos/seed/${seed}/1200/675`,
  alt: '',
});

const DEMO = [
  {
    title: 'Global Equities Climb as Central Banks Signal a Pause on Rates',
    deck: 'Investors bet that the tightening cycle is nearing its end, lifting bonds and shares alike.',
    kicker: 'Markets',
    category: 'Markets',
    author: 'Eleanor Vance',
    featured: 100,
    tags: ['rates', 'equities'],
    heroImage: hero('markets'),
    body: [
      {
        type: 'paragraph',
        text: 'Stocks rose across major markets Tuesday as policymakers hinted that the long campaign of interest-rate increases may soon be over, sending a wave of optimism through trading floors.',
      },
      {
        type: 'paragraph',
        text: 'The shift marks a turning point for portfolios battered by a year of volatility, analysts said, though caution remains over stubborn inflation.',
      },
      { type: 'heading', text: 'A fragile consensus' },
      {
        type: 'paragraph',
        text: 'Not everyone is convinced the rally can last. Several strategists warned that a single hot inflation print could reverse the mood overnight.',
      },
    ],
  },
  {
    title: 'Chipmakers Race to Build the Next Generation of AI Accelerators',
    deck: 'A scramble for compute is reshaping the semiconductor industry and global supply chains.',
    kicker: 'Technology',
    category: 'Tech',
    author: 'Marcus Lin',
    featured: 80,
    tags: ['ai', 'semiconductors'],
    heroImage: hero('chips'),
    body: [
      {
        type: 'paragraph',
        text: 'Demand for specialized processors has turned a once-sleepy corner of the chip industry into its hottest battleground.',
      },
      {
        type: 'paragraph',
        text: 'Foundries are booking capacity years in advance as buyers compete for every available wafer.',
      },
    ],
  },
  {
    title: 'Diplomats Reach Tentative Accord After Marathon Talks',
    deck: 'The agreement, still fragile, could reset relations across the region.',
    kicker: 'World',
    category: 'World',
    author: 'Sofia Marchetti',
    featured: 60,
    tags: ['diplomacy'],
    heroImage: hero('world'),
    body: [
      {
        type: 'paragraph',
        text: 'After three days of closed-door negotiations, envoys emerged with the outline of a deal that observers had thought unlikely a week ago.',
      },
      {
        type: 'quote',
        text: 'This is a beginning, not an end.',
        attribution: 'A senior negotiator',
      },
      { type: 'paragraph', text: 'Implementation will be the true test, analysts cautioned.' },
    ],
  },
  {
    title: 'The Quiet Revolution in Corporate Boardrooms',
    deck: 'How a new generation of directors is rewriting the rules of governance.',
    kicker: 'Business',
    category: 'Business',
    author: 'Daniel Okafor',
    featured: 50,
    tags: ['governance'],
    heroImage: hero('business'),
    body: [
      {
        type: 'paragraph',
        text: 'Boardrooms long known for their predictability are becoming arenas of genuine debate.',
      },
      {
        type: 'list',
        ordered: false,
        items: [
          'Tighter oversight of executive pay',
          'More scrutiny of long-term strategy',
          'Faster responses to activist investors',
        ],
      },
    ],
  },
  {
    title: 'An Election That Could Redraw the Political Map',
    deck: 'Voters head to the polls amid the sharpest divisions in a generation.',
    kicker: 'Politics',
    category: 'Politics',
    author: 'Harper Reyes',
    featured: 40,
    tags: ['elections'],
    heroImage: hero('politics'),
    body: [
      {
        type: 'paragraph',
        text: 'Turnout is expected to break records as both sides frame the contest as decisive.',
      },
      {
        type: 'paragraph',
        text: 'Late polling suggests a margin narrow enough to keep results uncertain into the night.',
      },
    ],
  },
  {
    title: 'Why the Case for Patience Has Never Been Stronger',
    deck: 'In a market obsessed with speed, the long view is a contrarian bet.',
    kicker: 'Opinion',
    category: 'Opinion',
    author: 'J. P. Sutherland',
    featured: 30,
    tags: ['commentary'],
    heroImage: hero('opinion'),
    body: [
      {
        type: 'paragraph',
        text: 'Every cycle produces a chorus insisting that this time is different. It rarely is.',
      },
      {
        type: 'paragraph',
        text: 'The discipline to wait, unglamorous as it sounds, remains the surest edge an investor has.',
      },
    ],
  },
  {
    title: 'A Retrospective That Reframes a Master',
    deck: 'The new exhibition asks us to see a familiar body of work with fresh eyes.',
    kicker: 'Arts',
    category: 'Arts',
    author: 'Camille Dubois',
    featured: 20,
    tags: ['art'],
    heroImage: hero('arts'),
    body: [
      {
        type: 'paragraph',
        text: 'Hung in roughly chronological order, the show reveals a restless experimenter behind the icon.',
      },
      { type: 'paragraph', text: 'It is, above all, an argument for looking slowly.' },
    ],
  },
  {
    title: 'Energy Markets Brace for a Volatile Winter',
    deck: 'Supply jitters and shifting demand set the stage for price swings.',
    kicker: 'Markets',
    category: 'Markets',
    author: 'Eleanor Vance',
    featured: 10,
    tags: ['energy'],
    heroImage: hero('energy'),
    body: [
      {
        type: 'paragraph',
        text: 'Traders are positioning for turbulence as forecasts diverge on the season ahead.',
      },
      { type: 'paragraph', text: 'Storage levels offer a cushion, but little room for shocks.' },
    ],
  },
] as const;

async function main(): Promise<void> {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  });
  if (!login.ok) {
    process.stderr.write(`login failed: ${login.status} ${await login.text()}\n`);
    process.exit(1);
  }
  const { token } = (await login.json()) as { token: string };
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };

  let created = 0;
  let skipped = 0;
  for (const demo of DEMO) {
    const slug = slugify(demo.title);
    const existing = await fetch(`${API}/api/articles/${slug}`);
    if (existing.ok) {
      skipped += 1;
      continue;
    }
    const res = await fetch(`${API}/api/admin/articles`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ ...demo, status: 'draft', seo: {} }),
    });
    if (!res.ok) {
      process.stderr.write(
        `create failed for "${demo.title}": ${res.status} ${await res.text()}\n`,
      );
      continue;
    }
    const article = (await res.json()) as { id: string };
    const pub = await fetch(`${API}/api/admin/articles/${article.id}/publish`, {
      method: 'POST',
      headers: auth,
    });
    if (!pub.ok) {
      process.stderr.write(`publish failed for "${demo.title}": ${pub.status}\n`);
      continue;
    }
    created += 1;
    process.stdout.write(`published: ${demo.title}\n`);
  }
  process.stdout.write(
    `\ndemo seed via API complete: ${created} created, ${skipped} already existed\n`,
  );
}

await main();
