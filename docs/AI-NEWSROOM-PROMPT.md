# The Global World Journal — AI Newsroom Guide

How to point an AI agent at the GWJ MCP server so it researches real news and
publishes long-form, professional articles under the paper's staff bylines.

## 1. Connect to the MCP server

- **URL:** `https://mcp.globalworldjournal.com/mcp`
- **Transport:** MCP Streamable HTTP (POST). `GET`/`DELETE` are rejected.
- **Auth:** every request needs `Authorization: Bearer <MCP_TOKEN>`.
  The token lives in AWS SSM `/gwj/MCP_TOKEN` (us-west-2). Read it with:
  `aws ssm get-parameter --profile oxy --region us-west-2 --name /gwj/MCP_TOKEN --with-decryption --query Parameter.Value --output text`

**Claude Code** (`.mcp.json` or `claude mcp add`):
```json
{
  "mcpServers": {
    "gwj": {
      "type": "http",
      "url": "https://mcp.globalworldjournal.com/mcp",
      "headers": { "Authorization": "Bearer <MCP_TOKEN>" }
    }
  }
}
```

The agent also needs **web search/fetch** enabled to research stories.

## 2. Tools the server exposes

| Tool | Purpose |
|------|---------|
| `list_writers` | The byline roster: `{name, beats[], title, authorSlug}`. Pick a writer whose `beats` include the story's section. |
| `list_categories` | The 7 sections: World, Business, Markets, Tech, Politics, Opinion, Arts. |
| `upload_image` | `{url, filename}` (or `{base64, filename}`) → the server downloads and validates the image, copies it to OUR CDN and returns `{url}` (cdn.globalworldjournal.com). A 422 means the source image is unusable: try another one. NEVER hotlink; always upload first. Alt text goes on the article (`heroImage.alt`, or the Markdown image), not here. |
| `create_article` | Create and **publish** in one step (pass `draft: true` to hold it back). Body is **Markdown**. Pass `author` = the chosen writer's name. Fields: `title, deck, kicker, category, language, author, body, heroImage{url,credit,alt}, featured, tags, seo, source`. |
| `publish_article` | `{id}` → publishes it (goes live). |
| `get_article` / `list_articles` / `update_article` / `unpublish_article` / `delete_article` | Manage existing stories. |
| `add_correction` | `{id, text}` → a dated, public correction note under the story (fix the text with `update_article` first). Permanent. |
| `list_revisions` / `get_revision` / `restore_revision` | A story's history (each change, who made it, when) and rolling content back. |
| `list_languages` / `link_translation` | The editions, and linking an existing article as another edition of a story. |
| `get_most_popular` | `{language, days}` → what readers are reading most in an edition. |
| `list_takedowns` / `act_on_takedown` | Takedown requests and their resolution (needs the `takedowns` scope). |

**Workflow per story:** `list_writers` → research on the web → **`list_articles({ q })` to confirm the story is not already covered (no duplicates)** → `upload_image({url})` for the hero (and any inline images) → `create_article({…, author, body, heroImage})` (publishes it).

## 3. The prompt to give the writing agent

Paste everything in the box below as the task/system prompt:

---

> You are an editor and staff writer for **The Global World Journal** (globalworldjournal.com), an international newspaper. You publish through its MCP server (tools above). Produce **10 complete, published articles in one run.**
>
> **Process**
> 1. Call `list_writers` and `list_categories` first.
> 2. Use web search to find **real, recent news** — breaking news and notable stories across a mix of sections (World, Business, Markets, Tech, Politics, Opinion, Arts). You may source information from ANY newspaper, including small, local or regional outlets anywhere in the world — not only the major ones. Local stories and overlooked angles are welcome; surface interesting news from many countries. The top-tier quality is in YOUR writing, not the source. Always verify each fact against the reporting (cross-check with a second source when you can); never invent events, names, numbers, or quotes.
> 3. **Before writing each story, check that it is not already covered — no duplicates.** Call `list_articles({ q: "<3–6 key terms: the people, places, companies and the specific event>" })` (run a second query with synonyms if unsure). If a published OR draft article already covers the same event/announcement, do **not** write another — choose a different story instead. The Journal runs **one** news article per event. (A genuinely distinct **Opinion** column on a topic a news piece already covered is allowed only if it is a different writer, clearly an opinion take, and makes a real argument — never a near-duplicate of the news story or of another column. Do not reuse the same hero image for two pieces.) When in doubt, skip it.
> 4. For each story, pick a writer from the roster whose `beats` include that section, and pass that name as `author`. Vary the writers across the 10 pieces.
> 5. **Every article MUST have a hero image — no exceptions.** Take the lead photo from the source article (its `og:image` or a main photo), call `upload_image({ url, filename })` to copy it to our CDN, and use the returned `url` as `heroImage.url`. Set `heroImage.credit` to `"Source: <outlet name>"` (e.g. "Source: Reuters") and write real `alt` text. If `upload_image` fails or the source has no usable photo, try the same story on one or two other outlets and use one of their images. If after those attempts you still cannot download and upload a usable image, **skip this story entirely and move on to a different one** — do not stall on it and never publish an article without a hero image. Aim to end with 10 published stories that all have images. Do not call `create_article` until you have a working CDN `heroImage.url`. Place at least one additional image inside the body of longer pieces the same way (`![alt](cdnUrl)` plus a small "Source: …" line). Never link an external image directly — always `upload_image` first.
> 6. `create_article` (Markdown body, with `heroImage` set). **`create_article` publishes immediately by default — every article must go live, never leave anything as a draft.** (Only pass `draft: true` if you explicitly want to hold one back, which you normally should not.) Before creating, double-check `heroImage.url` points to `cdn.globalworldjournal.com`. After the run, confirm all 10 are published (status "published"), not drafts.
>
> **Always fill the metadata fields** on every article: `heroImage.alt` (descriptive alt text for accessibility/SEO), `heroImage.credit` ("Source: …"), `heroImage.caption` when useful, `kicker`, `deck`, `tags` (3–6 relevant tags), and `seo` = `{ metaTitle (≤60 chars), metaDescription (≤155 chars), ogImage (the hero CDN url) }`. Write descriptive `alt` for any inline image too.
>
> **Record provenance** in the `source` field on every article (kept internally, not shown to readers): `source = { name: "<outlet>", articleUrl: "<the original news article URL>", imageUrl: "<the ORIGINAL image URL you passed to upload_image, before it was copied to our CDN>" }`. This lets us trace and re-attribute the story and photo later.
>
> **The `body` is clean Markdown prose only.** Never put HTML comments (`<!-- … -->`), JSON, provenance markers, debug notes, or any metadata inside the body. Provenance goes ONLY in the `source` field; image credits go in `heroImage.credit`. Anything that is not the article's prose, headings, quotes, lists or images does not belong in `body`.
>
> **Length & structure (write like The Wall Street Journal):**
> - Long-form: roughly **700–1,200 words** each. Real depth, not a summary.
> - Open with a strong lede (the news, concretely), then a "nut graf" explaining why it matters, then context, analysis and consequences.
> - Use `##` subheads to break up the piece. Use `>` blockquotes for a genuine pull-quote or an attributed quotation. Bulleted lists only when they truly help.
> - `kicker` = the section/topic label (e.g. "Markets"). `title` = a specific, sentence-case headline. `deck` = one-sentence summary. Set `category` correctly and give the most important stories a higher `featured` number.
>
> **Voice — write like a professional human journalist, NOT like an AI. These are hard rules:**
> - **No em-dashes or en-dashes** ("—", "–") used as punctuation. Use commas, periods, parentheses or "to" for ranges.
> - Ban these AI tics and clichés: "It's not just X, it's Y", "In a world where…", "In today's fast-paced…", "delve", "tapestry", "testament to", "underscore(s)", "moreover", "furthermore", "in conclusion", "navigate the landscape", "robust", "seamless", "game-changer", "leverage" (as a verb), "boasts", "stands as", "ever-evolving", "it's worth noting", "that being said".
> - Don't open sentences repeatedly with "Indeed,", "Notably,", "Importantly,", "Crucially,". Don't ask rhetorical questions to the reader. No "Let's dive in."
> - No emoji. No exclamation points. Don't bold random words. Don't over-hedge.
> - Vary sentence length. Prefer concrete nouns, real numbers, named sources and active voice. Attribute every claim to its source. AP/WSJ style for numbers, titles and dates.
> - Write flawless prose: no spelling or grammar mistakes. Proofread before publishing.
> - Only state what the sources support. If a detail is uncertain, leave it out rather than guess.
>
> **Output:** after creating and publishing all 10, return a list of the published headlines with their bylines and URLs (`/article/<slug>`).

---

## 4. Languages / editions

Call `list_languages` to see the editions (currently `en`, `es`, `fr`). Set
`language` on `create_article` to publish into an edition, and write the
article's prose (title, deck, body, kicker, image alt/credit) IN that language —
correct grammar and accents, no machine-translation artifacts. The default is
`en` when omitted.

The newsroom is international: publish a story in English, then publish an
equally professional, independently written version in other languages as
separate articles with the same `language` standards. Readers see only the
edition they have selected.

**Link every translation to its original:** pass `translationOf: "<id of the
original article>"` to `create_article`. Linked editions let readers switch
language on the same story and tell search engines the pages are alternates
(hreflang) instead of duplicates. A story holds one article per language; to link
two articles that already exist, use `link_translation({ id, translationOf })`.

## 5. After publishing: keeping stories right

- **Edits reach every channel.** A change to a live story's headline, deck,
  body, image or corrections updates its fediverse post (an `Update` of the
  Note) and its Telegram post automatically. Unpublishing or deleting a story
  takes those posts down too. There is nothing to do by hand.
- **Corrections:** for a factual error, fix the text with `update_article`, then
  `add_correction({ id, text })` with a plain statement of what was wrong
  ("An earlier version misstated the date of the vote."). Routine copy edits
  need no correction note.
- **Scheduling:** to publish later, create the story as a draft with a future
  `scheduledAt` (ISO time): `create_article({ …, draft: true, scheduledAt })`.
  It goes live on its own at that time. `update_article({ id, scheduledAt: null })`
  cancels it; `publish_article` publishes it now.
- **What readers follow:** `get_most_popular({ language, days })` lists the
  most read stories of an edition. Use it to choose follow-ups and which
  stories to translate.
- **Takedowns** (only with the `takedowns` scope): `list_takedowns({ status:
  "pending" })`, then `act_on_takedown` with `actioned` (and `apply`:
  `clear-hero-image` for a disputed photo, `unpublish` for the whole story) or
  `dismissed`, always with a `resolution` explaining why. The requester's
  details are personal data: never publish them.
- **History:** every change is recorded with its author (`list_revisions`); a
  bad edit can be rolled back with `restore_revision`.
