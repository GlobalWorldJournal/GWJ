/**
 * Seed The Global World Journal with REAL, long-form, rewritten news over the
 * live admin API. Stories are written in GWJ's own words from current reporting
 * (facts are not copyrightable). Body is Markdown. The hero image is the source
 * article's own photo (og:image), copied to OUR CDN (no external hotlinking) and
 * credited "Source: <outlet>". Bylines come from the GWJ writer roster.
 *
 * Replaces all existing articles. Run:
 *   API_BASE_URL=https://api.globalworldjournal.com ADMIN_USERNAME=nate \
 *   ADMIN_PASSWORD=… bun run scripts/seed-real-news.ts
 */
import { pickWriter, type ArticleInput, type Category } from '@gwj/shared-types'

const API = (process.env.API_BASE_URL ?? '').replace(/\/$/, '')
const USER = process.env.ADMIN_USERNAME ?? ''
const PASS = process.env.ADMIN_PASSWORD ?? ''
if (!API || !USER || !PASS) {
  console.error('Missing API_BASE_URL / ADMIN_USERNAME / ADMIN_PASSWORD')
  process.exit(1)
}

const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

interface Story {
  title: string
  deck: string
  kicker: string
  category: Category
  featured: number
  imageAlt: string
  /** Source article — its og:image becomes the hero; name is the credit. */
  source?: { name: string; url: string }
  body: string // Markdown
}

const STORIES: Story[] = [
  {
    title: 'Global Tech Sell-Off Erases More Than $1 Trillion as AI Valuations Wobble',
    deck: 'Doubts about stretched valuations swept through the largest AI, chip and memory stocks, with Nasdaq futures pointing sharply lower and a war-driven inflation scare in the background.',
    kicker: 'Markets',
    category: 'Markets',
    featured: 100,
    imageAlt: 'Traders on a stock exchange floor',
    source: { name: 'CNBC', url: 'https://www.cnbc.com/2026/06/23/tech-stocks-sell-off-mag7-samsung-sk-hynix.html' },
    body: `A wave of selling tore through global equity markets on Tuesday as investors reassessed the towering valuations attached to the companies driving the artificial-intelligence boom. Nasdaq 100 futures fell about 2.8% before the opening bell, a decline that would erase more than $1 trillion in market value if it held through the session.

The drop was striking for its breadth. Every member of the so-called "magnificent seven" — Alphabet, Amazon, Apple, Meta Platforms, Microsoft, Nvidia and Tesla — traded lower in the pre-market, a rare show of unanimity that underscored just how concentrated the market's gains had become over the past two years.

## A crowded trade unwinds

For much of the rally, a handful of megacap names accounted for the lion's share of index returns, leaving portfolios quietly dependent on the same small group of stocks. When sentiment turned, there was little to cushion the fall.

"The market had priced these companies for a future in which everything goes right," one strategist said. "Tuesday was a reminder that the path there is rarely a straight line."

## Rates back in focus

Part of the unease traces to the conflict with Iran and the disruption around the Strait of Hormuz, which has revived fears of higher energy prices and stickier inflation. That, in turn, raises the prospect of interest rates staying elevated for longer — an uncomfortable backdrop for an industry financing a vast, debt-fueled build-out of data centers.

Higher borrowing costs do not merely dent sentiment; they change the math behind the capital expenditure that has underwritten the AI story. Every percentage point matters when the build-out is measured in the hundreds of billions.

## What to watch

Analysts cautioned against reading a single session as a verdict. Earnings from the largest technology companies, due in the coming weeks, will test whether the fundamentals still justify the valuations — or whether Tuesday was the first crack in a more durable repricing.

For now, the safest conclusion is the oldest one on Wall Street: when a trade gets crowded enough, it does not take much to start a stampede for the exits.`,
  },
  {
    title: 'SpaceX Shares Slide for a Fifth Day, Wiping Out Roughly $900 Billion',
    deck: "After a blistering debut, the rocket maker's stock has retreated sharply from its peak, dragging the broader technology complex down with it.",
    kicker: 'Technology',
    category: 'Tech',
    featured: 92,
    imageAlt: 'A rocket on a launch pad',
    source: { name: 'NBC News', url: 'https://www.nbcnews.com/business/business-news/tech-sell-off-markets-spacex-alphabet-nasdaq100-stocks-rcna351331' },
    body: `Shares of SpaceX extended their slide for a fifth straight session, erasing close to $900 billion in value from the roughly $225 peak the stock reached only a week ago, shortly after its closely watched debut on the U.S. market.

The reversal has become the defining image of the week's turmoil. A listing that was supposed to crown the AI-and-space investment era has instead turned into a cautionary tale about how quickly euphoria can curdle.

## From symbol to warning

When the stock first traded, it was treated as a generational event — proof, supporters argued, that the public markets were finally willing to reward moonshot ambition. The frenzy pushed the valuation to levels that left little room for disappointment.

That math has now inverted. As momentum traders who piled in at the open rushed to lock in gains, the same reflexivity that drove the stock up accelerated its descent.

## The business beneath the noise

Beyond the ticker, the company's operating story is largely unchanged. Its launch cadence remains the envy of the industry, and its satellite-broadband network continues to add subscribers.

"The fundamentals didn't move $900 billion in five days," one portfolio manager said. "Sentiment did." The challenge for long-term holders is separating the durability of the business from the volatility of its newly public stock.

## A test for the next debut

The episode is likely to weigh on the pipeline of companies hoping to follow SpaceX to market. Bankers who spent the spring marketing the return of the blockbuster IPO may find investors in a more sober mood.`,
  },
  {
    title: "Korea's Kospi Plunges 10% as Samsung and SK Hynix Lead a Chip Rout",
    deck: 'Asia bore the brunt of the global sell-off, with the two memory-chip giants each falling more than 12% and semiconductor shares sinking on Wall Street.',
    kicker: 'Markets',
    category: 'Markets',
    featured: 74,
    imageAlt: 'A semiconductor chip',
    source: { name: 'CNBC', url: 'https://www.cnbc.com/2026/06/23/tech-stocks-sell-off-mag7-samsung-sk-hynix.html' },
    body: `South Korea's benchmark Kospi index closed down about 10% on Tuesday after its two most valuable companies, Samsung Electronics and SK Hynix, each fell more than 12% — one of the most punishing sessions in years for an economy levered to the global chip cycle.

The pain did not stay in Seoul. In New York pre-market trading, the iShares Semiconductor ETF dropped 6.2%. Intel slid 7.6%, Micron lost 8.5% and AMD fell 6.2%.

## The memory boom cuts both ways

Memory makers have been among the biggest beneficiaries of the AI build-out, as demand for high-bandwidth memory used in AI accelerators sent prices and order books soaring. That same leverage now works in reverse: when investors question how durable AI demand will be, the most exposed names fall the hardest.

## Concentration risk, national edition

For Korea, the rout is also a story about concentration. Samsung and SK Hynix loom so large over the Kospi that a bad day for chips is a bad day for the entire market — and, by extension, for millions of retail investors and pension holders.

Policymakers have long sought to broaden the index beyond its semiconductor anchors. Tuesday was a reminder of how far that effort still has to go.`,
  },
  {
    title: 'Strait of Hormuz Remains Contested as Tehran Sends Mixed Signals',
    deck: "Iran's Revolutionary Guard declared the waterway closed, even as the country's foreign ministry insisted shipping was operating normally.",
    kicker: 'World',
    category: 'World',
    featured: 88,
    imageAlt: 'An oil tanker at sea',
    source: { name: 'CNN', url: 'https://www.cnn.com/2026/06/20/world/live-news/iran-war-trump-israel-lebanon' },
    body: `The status of the Strait of Hormuz, the narrow passage through which a large share of the world's seaborne oil flows, remained unsettled this week as Iranian authorities offered openly conflicting accounts of whether it was open.

Iran's Revolutionary Guard command declared the strait closed to all vessels, citing what it called breaches of a recently signed memorandum and pointing in particular to continued strikes in southern Lebanon. Within hours, the country's foreign ministry struck a very different tone, insisting that traffic was "operating normally."

## Ships keep moving

The on-the-water reality appeared closer to the ministry's account. U.S. Central Command reported that vessels were still transiting the strait, counting 55 ships in a single day.

Shipowners, however, are not waiting for the politics to resolve. Insurers have raised war-risk premiums, some operators have rerouted or paused voyages, and crews are weighing the danger of being caught in any renewed crossfire.

## Why a few miles of water matter

The strait's importance is out of all proportion to its size. At its narrowest it is barely 21 miles across, and there is no overland route that can fully replace it. A genuine closure — as opposed to a rhetorical one — would ripple through fuel prices and inflation expectations within days.

That asymmetry is exactly why the mixed signals from Tehran carry such weight: in a market this sensitive, ambiguity itself is a form of leverage.`,
  },
  {
    title: 'After Versailles: The Fragile Memorandum Meant to End the Iran War',
    deck: 'A deal signed with considerable ceremony halted months of fighting. Enforcement — especially over Lebanon — is already being tested.',
    kicker: 'World',
    category: 'World',
    featured: 66,
    imageAlt: 'A grand palace hall',
    source: { name: 'CNN', url: 'https://www.cnn.com/2026/06/14/world/live-news/iran-war-trump-israel' },
    body: `The agreement that paused this year's war between Iran and a U.S.-Israeli coalition was sealed with the kind of pageantry usually reserved for the end of much longer conflicts. Iran's president signed in Tehran; the American side signed, following the G7 summit, at the Palace of Versailles.

Known as the Islamabad Memorandum, the deal ended both the fighting and a dual blockade that had choked regional trade since hostilities erupted in late winter. For a region braced for a far longer war, the speed of the settlement was its own kind of shock.

## A deal built on ambiguity

Diplomacy that ends a war quickly often does so by leaving the hardest questions for later. The memorandum is no exception. Its language on enforcement is broad enough that each side can claim the other is in breach — and each side already has.

The sharpest flashpoint is Lebanon, where continued strikes have handed hardliners a ready-made grievance and a reason to question whether the truce can survive the 60-day window meant to produce a final settlement.

## The clock and its risks

That 60-day clock is the deal's central gamble: a bet that a short, pressured negotiating window will force compromises that years of talks could not. The danger is that the same urgency cuts the other way, giving spoilers on both sides an incentive to run out the clock.

For now, the guns are mostly quiet. Whether they stay that way may depend less on what was signed at Versailles than on what happens in the towns along Lebanon's southern border.`,
  },
  {
    title: 'A 60-Day Clock and a Lebanon Flashpoint Test the New Iran Truce',
    deck: 'With a final settlement due within two months, both sides are trading accusations over who is honoring the ceasefire.',
    kicker: 'Politics',
    category: 'Politics',
    featured: 58,
    imageAlt: 'Diplomats at a negotiating table',
    source: { name: 'NPR', url: 'https://www.npr.org/2026/06/18/nx-s1-5863517/trump-iran-deal-blockade-strait-hormuz' },
    body: `The lifting of the blockade on Iranian ports started a 60-day clock toward a final agreement — and, almost immediately, a fight over whether the interim truce is being honored.

Negotiators framed the timeline as a forcing mechanism: a deadline short enough to keep momentum, long enough to hammer out the details that the memorandum left deliberately vague.

## Competing narratives

In Washington, officials have emphasized compliance and the resumption of commercial shipping. In Tehran, military commanders have pointed to continued strikes in Lebanon as evidence that the other side is not keeping its word.

Both narratives can be partly true at once, which is precisely what makes the next two months so precarious. A ceasefire that each party interprets differently is a ceasefire that can unravel over a single incident.

## What a final deal would need

Diplomats say a durable settlement will have to address the issues the memorandum skirted: monitoring and verification, the status of regional proxies, and a credible mechanism for resolving disputes short of a return to war.

None of that is easy in 60 days. The question hanging over the talks is whether the deadline produces a deal — or simply a new crisis when it expires.`,
  },
  {
    title: 'Supreme Court Races Toward an Explosive Finale With the Midterms at Stake',
    deck: 'Pending rulings on mail-in ballots, campaign-finance limits and presidential power could reshape the 2026 elections in their final weeks.',
    kicker: 'Politics',
    category: 'Politics',
    featured: 52,
    imageAlt: 'A courthouse facade',
    source: { name: 'CNN', url: 'https://www.cnn.com/2026/06/03/politics/supreme-court-explosive-final-month-birthright-cook-voting-tps' },
    body: `The Supreme Court is racing to clear a docket of consequential cases before its term ends, with rulings that could reshape the 2026 midterm elections even as voters begin to tune in.

Among the most closely watched: a challenge to laws in 14 states that count mail-in ballots received after Election Day, a case revisiting Watergate-era limits on coordinated party spending, and disputes over the scope of presidential power.

## Ballots and the calendar

The mail-in ballot case carries unusual urgency because of timing. Election administrators have warned that moving the deadlines this close to the midterms could sow confusion among voters who have relied for years on grace periods built in to account for postal delays.

## Money and coordination

The campaign-finance case asks whether long-standing caps on how much parties can spend in coordination with their candidates should fall. Election-law experts say lifting them would reshape how money flows in the closing weeks of campaigns.

## A court under scrutiny

All of it unfolds against a charged political backdrop, with the justices' independence itself a subject of public debate. However the rulings land, they will be parsed not only for their legal reasoning but for their effect on a closely divided electorate.`,
  },
  {
    title: 'Higher Borrowing Costs Threaten the Trillion-Dollar AI Build-Out',
    deck: "The industry's appetite for data centers assumed cheap money. A war-driven inflation scare is challenging that bet.",
    kicker: 'Business',
    category: 'Business',
    featured: 60,
    imageAlt: 'Rows of servers in a data center',
    source: { name: 'CNBC', url: 'https://www.cnbc.com/technology/' },
    body: `The breakneck expansion of artificial-intelligence infrastructure has rested on a quiet assumption: that capital would stay cheap. That premise is now under strain.

With the conflict in the Gulf raising the specter of higher energy prices and stickier inflation, investors are bracing for interest rates to remain elevated for longer — a shift that makes the debt-financed construction of sprawling data centers markedly more expensive.

## The economics of the build-out

Data centers are capital-intensive and increasingly financed with borrowing. When rates rise, the hurdle each new facility must clear to justify its cost rises with them. For the hyperscalers and the chipmakers that supply them, the question is no longer only how fast they can build, but how much that growth will cost.

## A test of discipline

For two years, the market rewarded spending almost without question. A higher cost of capital reintroduces a discipline that had gone missing: the need to show that all that concrete, silicon and power will earn a return.

Executives who once raced to announce ever-larger commitments may find investors asking a harder question — not whether they can build, but whether they should.`,
  },
  {
    title: "Fox Strikes a $22 Billion Deal for Roku in a Bet on Connected TV",
    deck: 'The cash-and-stock tie-up would fuse Fox’s sports, news and entertainment with Roku’s streaming platform and its trove of viewer data.',
    kicker: 'Business',
    category: 'Business',
    featured: 48,
    imageAlt: 'A television showing a streaming home screen',
    source: { name: 'CNBC', url: 'https://www.cnbc.com/media/' },
    body: `Fox Corp. has agreed to acquire Roku in a cash-and-stock transaction valued at roughly $22 billion, a deal that would marry one of the last great live-sports-and-news franchises to a leading connected-television platform.

The logic is straightforward, if ambitious: Fox brings programming that audiences still watch in real time, while Roku brings the operating system, the home screen and, crucially, the data about what tens of millions of households actually watch.

## Why connected TV

As traditional cable continues to shrink, the battle has shifted to the smart-TV interface — the screen viewers see first. Owning that layer means owning the relationship with the audience and a growing share of the advertising that follows them there.

## The questions ahead

A deal of this size will draw scrutiny, both from regulators wary of further media consolidation and from investors who will want to see how Fox integrates a hardware-and-software business that operates on very different rhythms from a television network.

For now, the agreement is a statement of where the industry believes the next decade of viewing — and advertising — will be won.`,
  },
  {
    title: 'A Strong June for Fiction, From O’Farrell’s ‘Land’ to a Pulitzer-Winning Memoir',
    deck: 'New work from Maggie O’Farrell and Yiyun Li anchors a rich early-summer reading season.',
    kicker: 'Books',
    category: 'Arts',
    featured: 36,
    imageAlt: 'A collage of book covers',
    source: { name: 'The Christian Science Monitor', url: 'https://www.csmonitor.com/Arts-Culture/Books/2026/0622/june-2026-best-books' },
    body: `It has been an unusually strong month for serious fiction and memoir, with new books reaching for the largest questions of grief, memory and loss.

Maggie O'Farrell's historical novel "Land" unfolds on a remote Irish peninsula in the aftermath of the Great Hunger, following a surveyor hired to map the territory and, in the process, to record the disappearance of the tenant households swept away by the blight. It is a book about what is lost when a place is reduced to lines on a chart.

## Grief, examined

Alongside it, Yiyun Li's memoir "Things in Nature Merely Grow," which won the Pulitzer Prize, reckons with the deaths of her two sons and asks what it means to keep living in the aftermath of profound grief. Li writes with a clarity that refuses easy consolation.

## A season of range

Together the two books make for a season in which fiction and memoir alike are unafraid of difficulty — a welcome corrective to a publishing calendar that often reserves its biggest swings for the fall.

For readers, the result is a rare embarrassment of riches in the middle of summer.`,
  },
  {
    title: 'Hollywood Bets on the Literary Shelf, From Ishiguro to Narnia',
    deck: 'Taika Waititi is adapting ‘Klara and the Sun’ while Greta Gerwig turns to ‘The Magician’s Nephew’ — a season of ambitious book-to-screen projects.',
    kicker: 'Film',
    category: 'Arts',
    featured: 28,
    imageAlt: 'A cinema auditorium',
    source: { name: 'RUSSH', url: 'https://www.russh.com/book-adaptations-2026/' },
    body: `Studios are once again raiding the bookshelf, with a slate of high-profile literary adaptations betting that prestige source material can cut through a crowded streaming market.

Taika Waititi is adapting Kazuo Ishiguro's 2021 novel "Klara and the Sun," with Jenna Ortega and Amy Adams attached, a story told from the perspective of an "Artificial Friend" built to keep a teenager company — a premise that lands differently in the age of AI companions.

## Gerwig returns to Narnia

Greta Gerwig, fresh off her run of commercial and critical successes, is adapting "The Magician's Nephew," the origin story of C.S. Lewis's Chronicles of Narnia, with Netflix backing and a late-2026 release planned.

## Why books, why now

The appeal is partly defensive. In a market saturated with original concepts that struggle to find an audience, a beloved title arrives with a built-in readership and a marketing hook. The risk is the same as it has always been: that the qualities that make a novel great — interiority, ambiguity, voice — are the hardest to film.

The coming year will test whether this crop of directors can translate the page without flattening it.`,
  },
  {
    title: 'The Market Forgot That Chokepoints Still Matter',
    deck: 'A single narrow strait can still move the price of everything. That is a lesson worth relearning.',
    kicker: 'Commentary',
    category: 'Opinion',
    featured: 40,
    imageAlt: 'An oil tanker in a narrow strait',
    source: { name: 'CNN', url: 'https://www.cnn.com/2026/06/20/world/live-news/iran-war-trump-israel-lebanon' },
    body: `For much of the past decade, investors treated geography as a solved problem. Supply chains were global, capital was frictionless, and the physical world rarely intruded on the spreadsheet.

The events around the Strait of Hormuz are a reminder that a few miles of contested water can still ripple through fuel prices, inflation expectations and, ultimately, the valuations of companies that look as if they have nothing to do with oil.

## The hidden cost of efficiency

Decades of optimization stripped slack out of the global economy in the name of efficiency. That slack was also resilience. We are now relearning, at some expense, that the two are not the same thing.

## Not panic, but memory

The lesson is not to panic at every headline from the Gulf. It is to remember that resilience has a price — and that the market has a habit of discovering that price all at once, usually at the least convenient moment.

A little humility about how much the physical world still matters would serve investors well. The map, it turns out, was never just lines on a chart.`,
  },
]

async function getOgImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'text/html' } })
    if (!res.ok) return null
    const html = await res.text()
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ??
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    if (!m || !m[1]) return null
    return m[1].replace(/&amp;/g, '&')
  } catch {
    return null
  }
}

async function uploadToCdn(token: string, imageUrl: string, filename: string): Promise<string | null> {
  try {
    const img = await fetch(imageUrl, { headers: { 'user-agent': UA } })
    if (!img.ok) return null
    const buf = new Uint8Array(await img.arrayBuffer())
    const type = img.headers.get('content-type') ?? 'image/jpeg'
    const form = new FormData()
    form.set('file', new Blob([buf], { type }), filename)
    const up = await fetch(`${API}/api/admin/upload`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: form,
    })
    if (!up.ok) return null
    const { url } = (await up.json()) as { url: string }
    return url
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const login = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS }),
  })
  if (!login.ok) {
    console.error(`login failed: ${login.status}`)
    process.exit(1)
  }
  const { token } = (await login.json()) as { token: string }
  const auth = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }

  const existing = (await (
    await fetch(`${API}/api/admin/articles?limit=50`, { headers: auth })
  ).json()) as { data: { id: string }[] }
  for (const a of existing.data) {
    await fetch(`${API}/api/admin/articles/${a.id}`, { method: 'DELETE', headers: auth })
  }
  console.log(`removed ${existing.data.length} existing article(s)`)

  let created = 0
  for (const story of STORIES) {
    let heroImage: ArticleInput['heroImage']
    if (story.source) {
      const og = await getOgImage(story.source.url)
      if (og) {
        const cdn = await uploadToCdn(token, og, `${story.kicker.toLowerCase()}-${created}.jpg`)
        if (cdn) heroImage = { url: cdn, alt: story.imageAlt, credit: `Source: ${story.source.name}` }
      }
    }
    const author = pickWriter(story.category, story.title).name
    const input: ArticleInput = {
      title: story.title,
      deck: story.deck,
      kicker: story.kicker,
      category: story.category,
      author,
      body: story.body,
      heroImage,
      status: 'draft',
      featured: story.featured,
      tags: [],
      seo: {},
    }
    const res = await fetch(`${API}/api/admin/articles`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(input),
    })
    if (!res.ok) {
      console.error(`create failed "${story.title}": ${res.status} ${await res.text()}`)
      continue
    }
    const article = (await res.json()) as { id: string }
    await fetch(`${API}/api/admin/articles/${article.id}/publish`, { method: 'POST', headers: auth })
    created += 1
    console.log(`published ${heroImage ? '[img]' : '[no img]'} by ${author}: ${story.title}`)
  }
  console.log(`\nreal-news seed complete: ${created} published`)
}

await main()
