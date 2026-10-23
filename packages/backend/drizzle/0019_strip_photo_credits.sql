-- oxy:deploy-phase=post
-- Runs once the new image serves (it strips these on every write from now on).
-- The stored stories' own copy of the rule in shared-types `stripPhotoCredit` /
-- `stripCreditLines`: no outlet photo credit at the end of a caption, and no
-- credit-only line ("Source: Reuters") in a body, in stories or their history.
WITH p AS (
  SELECT '(?i)\s*\|?\s*[(\[]?\s*(?:photo(?:graph)?(?:\s+credit)?|foto(?:graf[ií]a)?|cr[ée]dits?(?:\s+photo)?|cr[ée]dito(?:\s+de\s+la\s+foto)?|source|fuente)\s*:[^()\[\]\n]*[)\]]?\s*\.?\s*$' AS caption
)
UPDATE "articles" SET "hero_image" = jsonb_set(
  "hero_image", '{caption}',
  to_jsonb(regexp_replace(regexp_replace("hero_image"->>'caption', p.caption, ''), '^\s+|\s+$', '', 'g'))
)
FROM p WHERE "hero_image"->>'caption' ~ p.caption;--> statement-breakpoint
WITH p AS (
  SELECT '(?i)\s*\|?\s*[(\[]?\s*(?:photo(?:graph)?(?:\s+credit)?|foto(?:graf[ií]a)?|cr[ée]dits?(?:\s+photo)?|cr[ée]dito(?:\s+de\s+la\s+foto)?|source|fuente)\s*:[^()\[\]\n]*[)\]]?\s*\.?\s*$' AS caption
)
UPDATE "article_revisions" SET "snapshot" = jsonb_set(
  "snapshot", '{heroImage,caption}',
  to_jsonb(regexp_replace(regexp_replace("snapshot"->'heroImage'->>'caption', p.caption, ''), '^\s+|\s+$', '', 'g'))
)
FROM p WHERE "snapshot"->'heroImage'->>'caption' ~ p.caption;--> statement-breakpoint
WITH p AS (
  SELECT '(?in)^[ \t]*[_*]*(?:photo(?:graph)?(?:\s+credit)?|foto(?:graf[ií]a)?|cr[ée]dits?(?:\s+photo)?|cr[ée]dito(?:\s+de\s+la\s+foto)?|source|fuente)[ \t]*:[^\n]*\n?' AS line
)
UPDATE "articles" SET "body" = regexp_replace(
  regexp_replace(regexp_replace("body", p.line, '', 'g'), '\n{3,}', E'\n\n', 'g'), '^\s+|\s+$', '', 'g'
)
FROM p WHERE "body" ~ p.line;--> statement-breakpoint
WITH p AS (
  SELECT '(?in)^[ \t]*[_*]*(?:photo(?:graph)?(?:\s+credit)?|foto(?:graf[ií]a)?|cr[ée]dits?(?:\s+photo)?|cr[ée]dito(?:\s+de\s+la\s+foto)?|source|fuente)[ \t]*:[^\n]*\n?' AS line
)
UPDATE "article_revisions" SET "snapshot" = jsonb_set(
  "snapshot", '{body}',
  to_jsonb(regexp_replace(regexp_replace(regexp_replace("snapshot"->>'body', p.line, '', 'g'), '\n{3,}', E'\n\n', 'g'), '^\s+|\s+$', '', 'g'))
)
FROM p WHERE "snapshot"->>'body' ~ p.line;
