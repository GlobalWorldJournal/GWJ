import { useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CATEGORIES,
  SUPPORTED_LANGUAGES,
  LANGUAGE_NAMES,
  DEFAULT_LANGUAGE,
  WRITERS,
  isLanguage,
  type Article,
  type ArticleInput,
  type ArticleUpdate,
  type Category,
  type HeroImage,
  type Language,
} from '@gwj/shared-types';
import {
  createArticle,
  updateArticle,
  publishArticle,
  unpublishArticle,
  uploadImage,
  getAdminArticle,
  ApiRequestError,
} from '../lib/api';
import { useAuth } from './useAuth';
import { StatusMessage } from '../components/StatusMessage';
import { CorrectionsPanel } from './editor/CorrectionsPanel';
import { BodyEditor } from './editor/BodyEditor';
import { useUnsavedChangesGuard } from './editor/useUnsavedChangesGuard';
import { HistoryPanel } from './editor/HistoryPanel';
import { TranslationsPanel } from './editor/TranslationsPanel';

interface EditorForm {
  title: string;
  deck: string;
  kicker: string;
  category: Category;
  /** Edition this article belongs to. */
  language: Language;
  author: string;
  tags: string;
  featured: number;
  heroImage: HeroImage | null;
  /** Article body as GitHub-flavored Markdown. */
  body: string;
  /** URL slug; blank on a new article means "derive it from the title". */
  slug: string;
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  /** `datetime-local` value (the editor's local time); blank = no schedule. */
  scheduledAt: string;
  /** New article only: the id of the story it is an edition of. */
  translationOf: string;
}

/** An ISO instant as a `datetime-local` value in the browser's time zone. */
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function emptyForm(): EditorForm {
  return {
    title: '',
    deck: '',
    kicker: '',
    category: CATEGORIES[0],
    language: DEFAULT_LANGUAGE,
    author: '',
    tags: '',
    featured: 0,
    heroImage: null,
    body: '',
    slug: '',
    metaTitle: '',
    metaDescription: '',
    ogImage: '',
    scheduledAt: '',
    translationOf: '',
  };
}

function formFromArticle(article: Article): EditorForm {
  return {
    title: article.title,
    deck: article.deck ?? '',
    kicker: article.kicker ?? '',
    category: article.category,
    language: article.language,
    author: article.author,
    tags: article.tags.join(', '),
    featured: article.featured,
    heroImage: article.heroImage ?? null,
    body: article.body,
    slug: article.slug,
    metaTitle: article.seo.metaTitle ?? '',
    metaDescription: article.seo.metaDescription ?? '',
    ogImage: article.seo.ogImage ?? '',
    scheduledAt: toLocalInput(article.scheduledAt),
    translationOf: '',
  };
}

/**
 * The editable content of the form. Deliberately carries NO `status`: saving never
 * changes whether a story is live — that is only ever the explicit Publish /
 * Unpublish action, so saving an edit to a published story keeps it published.
 */
function formContent(form: EditorForm): Omit<ArticleInput, 'status' | 'slug'> {
  return {
    title: form.title,
    deck: form.deck || undefined,
    kicker: form.kicker || undefined,
    category: form.category,
    language: form.language,
    author: form.author,
    body: form.body,
    heroImage: form.heroImage ?? undefined,
    featured: form.featured,
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    // All three keys are always sent: an empty string clears a stored value.
    seo: {
      metaTitle: form.metaTitle.trim(),
      metaDescription: form.metaDescription.trim(),
      ogImage: form.ogImage.trim(),
    },
    // Blank clears any schedule (the API ignores a null on a live article).
    scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null,
    translationOf: form.translationOf || undefined,
  };
}

/** A new article always starts as a draft; a blank slug is derived from the title. */
function toArticleInput(form: EditorForm): ArticleInput {
  return { ...formContent(form), status: 'draft', slug: form.slug.trim() || undefined };
}

/** Only send a slug the editor actually changed; otherwise the server keeps it. */
function toArticleUpdate(form: EditorForm, savedSlug: string): ArticleUpdate {
  const slug = form.slug.trim();
  return { ...formContent(form), slug: slug && slug !== savedSlug ? slug : undefined };
}

export function Editor() {
  const { id } = useParams<{ id: string }>();
  const isNew = !id || id === 'new';

  if (isNew) {
    return <NewEditor />;
  }

  return <ExistingEditor id={id} />;
}

/**
 * A new article. `?translationOf=<id>&language=<code>` (from an article's
 * Editions panel) starts it already linked to that story, in that edition.
 */
function NewEditor() {
  const [params] = useSearchParams();
  const language = params.get('language');
  const initial: EditorForm = {
    ...emptyForm(),
    translationOf: params.get('translationOf') ?? '',
    language: language && isLanguage(language) ? language : DEFAULT_LANGUAGE,
  };
  return <EditorForm initial={initial} article={null} />;
}

function ExistingEditor({ id }: { id: string }) {
  const { token } = useAuth();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'article', id],
    queryFn: ({ signal }) => {
      if (!token) throw new Error('Not authenticated');
      return getAdminArticle(token, id, signal);
    },
    enabled: Boolean(token),
  });

  if (isPending) {
    return <StatusMessage title="Loading editor&hellip;" />;
  }
  if (isError) {
    if (error instanceof ApiRequestError && error.status === 404) {
      return <StatusMessage title="Article not found." />;
    }
    return (
      <StatusMessage
        title="Could not load the article."
        detail={error instanceof Error ? error.message : undefined}
      />
    );
  }

  return <EditorForm initial={formFromArticle(data)} article={data} />;
}

interface EditorFormProps {
  initial: EditorForm;
  /** The stored article being edited, or null for a new one. */
  article: Article | null;
}

function EditorForm({ initial, article }: EditorFormProps) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EditorForm>(initial);
  // The form as last loaded or saved: anything else is unsaved work.
  const [baseline, setBaseline] = useState<EditorForm>(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  // The server's view of the article after the latest save/publish/unpublish.
  const [saved, setSaved] = useState<Article | null>(article);

  function update<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin'] });
  }

  /** Persist `snapshot` (the form as it is now) without changing whether the story is live. */
  async function persist(authToken: string, snapshot: EditorForm): Promise<Article> {
    if (saved) return updateArticle(authToken, saved.id, toArticleUpdate(snapshot, saved.slug));
    return createArticle(authToken, toArticleInput(snapshot));
  }

  /**
   * After `snapshot` was stored: reflect server-side normalisation (a derived
   * slug) and make it the saved baseline — while keeping anything typed during
   * the save (still unsaved, so still guarded).
   */
  function onSaved(next: Article, snapshot: EditorForm) {
    setSaved(next);
    setForm((current) => ({ ...current, slug: next.slug }));
    setBaseline({ ...snapshot, slug: next.slug });
  }

  const save = useMutation({
    mutationFn: async () => {
      if (!token) throw new Error('Not authenticated');
      const snapshot = form;
      return { next: await persist(token, snapshot), snapshot };
    },
    onSuccess: async ({ next, snapshot }) => {
      onSaved(next, snapshot);
      await invalidate();
    },
  });

  const publish = useMutation({
    mutationFn: async (): Promise<Article> => {
      if (!token) throw new Error('Not authenticated');
      // Readers using screen readers (and search engines) depend on it.
      if (form.heroImage && !form.heroImage.alt.trim()) {
        throw new Error('Describe the hero image (alt text) before publishing.');
      }
      const snapshot = form;
      const stored = await persist(token, snapshot);
      onSaved(stored, snapshot);
      return publishArticle(token, stored.id);
    },
    onSuccess: async () => {
      await invalidate();
      navigate('/admin', { replace: true });
    },
  });

  const unpublish = useMutation({
    mutationFn: async (): Promise<Article> => {
      if (!token || !saved) throw new Error('Not authenticated');
      return unpublishArticle(token, saved.id);
    },
    onSuccess: async (next) => {
      setSaved(next);
      await invalidate();
    },
  });

  const heroUpload = useMutation({
    mutationFn: (file: File) => {
      if (!token) throw new Error('Not authenticated');
      return uploadImage(token, file);
    },
    onSuccess: (response) => {
      setForm((current) => ({
        ...current,
        heroImage: { url: response.url, alt: current.heroImage?.alt ?? '' },
      }));
    },
  });

  const isLive = saved?.status === 'published';
  // Once a story has been public its URL is frozen; changing it is deliberate.
  const slugFrozen = Boolean(saved?.firstPublishedAt) || isLive;
  const busy = save.isPending || publish.isPending || unpublish.isPending;
  const mutationError = save.error ?? publish.error ?? unpublish.error ?? heroUpload.error;

  const leaveGuard = useUnsavedChangesGuard(dirty && !publish.isPending);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      {leaveGuard}
      <header className="mb-6 flex items-center justify-between border-b-3 border-ink pb-4">
        <div className="flex items-baseline gap-3">
          <h1 className="headline text-2xl text-ink">{saved ? 'Edit Article' : 'New Article'}</h1>
          {saved ? (
            <span className={`label text-[0.625rem] ${isLive ? 'text-accent' : 'text-muted'}`}>
              {isLive
                ? 'Live'
                : saved.scheduledAt
                  ? `Scheduled · ${new Date(saved.scheduledAt).toLocaleString()}`
                  : 'Draft'}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent"
          >
            Back
          </button>
          {isLive ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => unpublish.mutate()}
              className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
            >
              {unpublish.isPending ? 'Unpublishing…' : 'Unpublish'}
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={() => save.mutate()}
            className={
              isLive
                ? 'label bg-ink px-4 py-2 text-[0.6875rem] text-paper transition-colors hover:bg-accent disabled:opacity-50'
                : 'label border border-ink px-4 py-2 text-[0.6875rem] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50'
            }
          >
            {save.isPending ? 'Saving…' : isLive ? 'Update' : 'Save Draft'}
          </button>
          {isLive ? null : (
            <button
              type="button"
              disabled={busy}
              onClick={() => publish.mutate()}
              className="label bg-ink px-4 py-2 text-[0.6875rem] text-paper transition-colors hover:bg-accent disabled:opacity-50"
            >
              {publish.isPending ? 'Publishing…' : 'Publish'}
            </button>
          )}
        </div>
      </header>

      {save.isSuccess && !busy ? <p className="mb-4 text-[0.85rem] text-ink-soft">Saved.</p> : null}

      {mutationError ? (
        <p className="mb-4 text-[0.85rem] text-accent">
          {mutationError instanceof Error ? mutationError.message : 'Something went wrong.'}
        </p>
      ) : null}

      <div className="flex flex-col gap-4">
        <Field label="Kicker">
          <TextInput value={form.kicker} onChange={(value) => update('kicker', value)} />
        </Field>

        <Field label="Title">
          <TextInput value={form.title} onChange={(value) => update('title', value)} />
        </Field>

        <Field label="Deck">
          <TextInput value={form.deck} onChange={(value) => update('deck', value)} />
        </Field>

        <Field
          label={
            slugFrozen
              ? 'URL slug (published: changing it moves the story; the old URL redirects)'
              : 'URL slug (leave blank to derive it from the title)'
          }
        >
          <TextInput value={form.slug} onChange={(value) => update('slug', value)} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Author">
            <select
              value={form.author}
              onChange={(event) => update('author', event.target.value)}
              className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
            >
              <option value="">Choose a writer…</option>
              {/* A byline from before the roster still shows (and can be kept). */}
              {form.author && !WRITERS.some((w) => w.name === form.author) ? (
                <option value={form.author}>{form.author}</option>
              ) : null}
              {WRITERS.map((writer) => (
                <option key={writer.name} value={writer.name}>
                  {writer.name} — {writer.beats.join(', ')}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Category">
            <select
              value={form.category}
              onChange={(event) => update('category', event.target.value as Category)}
              className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
            >
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Edition">
            <select
              value={form.language}
              onChange={(event) => update('language', event.target.value as Language)}
              className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
            >
              {SUPPORTED_LANGUAGES.map((code) => (
                <option key={code} value={code}>
                  {LANGUAGE_NAMES[code]}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Tags (comma separated)">
            <TextInput value={form.tags} onChange={(value) => update('tags', value)} />
          </Field>
          <Field label="Featured rank">
            <input
              type="number"
              min={0}
              value={form.featured}
              onChange={(event) => update('featured', Number(event.target.value) || 0)}
              className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
            />
          </Field>
        </div>

        <HeroImageField
          heroImage={form.heroImage}
          uploading={heroUpload.isPending}
          onUpload={(file) => heroUpload.mutate(file)}
          onAltChange={(alt) =>
            update('heroImage', form.heroImage ? { ...form.heroImage, alt } : null)
          }
          onCaptionChange={(caption) =>
            update('heroImage', form.heroImage ? { ...form.heroImage, caption } : null)
          }
          onCreditChange={(credit) =>
            update('heroImage', form.heroImage ? { ...form.heroImage, credit } : null)
          }
          onRemove={() => update('heroImage', null)}
        />

        <BodyEditor
          value={form.body}
          onChange={(body) => update('body', body)}
          onUploadImage={async (file) => {
            if (!token) throw new Error('Not authenticated');
            return (await uploadImage(token, file)).url;
          }}
        />

        {isLive ? null : (
          <Field label="Publish automatically at (your local time; leave blank to publish by hand)">
            <input
              type="datetime-local"
              value={form.scheduledAt}
              onChange={(event) => update('scheduledAt', event.target.value)}
              className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
            />
          </Field>
        )}

        <fieldset className="border border-rule p-4">
          <legend className="label px-2 text-[0.625rem] text-ink-soft">Search &amp; Sharing</legend>
          <div className="flex flex-col gap-4">
            <Field label={`Meta title (${form.metaTitle.length}/60)`}>
              <TextInput value={form.metaTitle} onChange={(value) => update('metaTitle', value)} />
            </Field>
            <Field label={`Meta description (${form.metaDescription.length}/155)`}>
              <TextInput
                value={form.metaDescription}
                onChange={(value) => update('metaDescription', value)}
              />
            </Field>
            <Field label="Social image URL (defaults to the hero image)">
              <TextInput value={form.ogImage} onChange={(value) => update('ogImage', value)} />
            </Field>
          </div>
        </fieldset>

        {saved?.source ? <ProvenancePanel source={saved.source} /> : null}

        {saved ? (
          <>
            <TranslationsPanel article={saved} onLinked={setSaved} />
            <CorrectionsPanel article={saved} onCorrected={setSaved} />
            <HistoryPanel
              articleId={saved.id}
              onRestored={(restored) => {
                setSaved(restored);
                setForm(formFromArticle(restored));
              }}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- provenance (read-only, never shown to readers) ---------- */

function ProvenancePanel({ source }: { source: NonNullable<Article['source']> }) {
  return (
    <fieldset className="border border-rule p-4">
      <legend className="label px-2 text-[0.625rem] text-ink-soft">Provenance (internal)</legend>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-[0.85rem] text-ink-soft">
        {source.name ? (
          <>
            <dt className="label text-[0.625rem]">Outlet</dt>
            <dd>{source.name}</dd>
          </>
        ) : null}
        {source.articleUrl ? (
          <>
            <dt className="label text-[0.625rem]">Article</dt>
            <dd className="break-all">
              <a
                href={source.articleUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="underline"
              >
                {source.articleUrl}
              </a>
            </dd>
          </>
        ) : null}
        {source.imageUrl ? (
          <>
            <dt className="label text-[0.625rem]">Image</dt>
            <dd className="break-all">{source.imageUrl}</dd>
          </>
        ) : null}
      </dl>
    </fieldset>
  );
}

/* ---------- field primitives ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label text-[0.625rem] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
    />
  );
}

/* ---------- hero image ---------- */

interface HeroImageFieldProps {
  heroImage: HeroImage | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onAltChange: (alt: string) => void;
  onCaptionChange: (caption: string) => void;
  onCreditChange: (credit: string) => void;
  onRemove: () => void;
}

function HeroImageField({
  heroImage,
  uploading,
  onUpload,
  onAltChange,
  onCaptionChange,
  onCreditChange,
  onRemove,
}: HeroImageFieldProps) {
  return (
    <fieldset className="border border-rule p-4">
      <legend className="label px-2 text-[0.625rem] text-ink-soft">Hero Image</legend>
      {heroImage?.url ? (
        <div className="flex flex-col gap-3">
          <img src={heroImage.url} alt={heroImage.alt} className="max-h-64 w-full object-cover" />
          <Field label="Alt text">
            <TextInput value={heroImage.alt} onChange={onAltChange} />
          </Field>
          <Field label="Caption">
            <TextInput value={heroImage.caption ?? ''} onChange={onCaptionChange} />
          </Field>
          <Field label="Credit">
            <TextInput value={heroImage.credit ?? ''} onChange={onCreditChange} />
          </Field>
          <button
            type="button"
            onClick={onRemove}
            className="label self-start text-[0.6875rem] text-accent"
          >
            Remove hero image
          </button>
        </div>
      ) : (
        <label className="label inline-flex cursor-pointer items-center gap-2 text-[0.6875rem] text-ink">
          <span className="border border-ink px-3 py-2 transition-colors hover:border-accent hover:text-accent">
            {uploading ? 'Uploading…' : 'Upload image'}
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onUpload(file);
              }
            }}
          />
        </label>
      )}
    </fieldset>
  );
}
