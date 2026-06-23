import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CATEGORIES,
  type Article,
  type ArticleInput,
  type Category,
  type ContentBlock,
  type HeroImage,
} from '@gwj/shared-types'
import {
  createArticle,
  updateArticle,
  publishArticle,
  uploadImage,
  getAdminArticles,
} from '../lib/api'
import { useAuth } from './useAuth'
import { StatusMessage } from '../components/StatusMessage'

type BlockType = ContentBlock['type']

interface EditorForm {
  title: string
  deck: string
  kicker: string
  category: Category
  author: string
  tags: string
  featured: number
  heroImage: HeroImage | null
  body: ContentBlock[]
}

function emptyForm(): EditorForm {
  return {
    title: '',
    deck: '',
    kicker: '',
    category: CATEGORIES[0],
    author: '',
    tags: '',
    featured: 0,
    heroImage: null,
    body: [],
  }
}

function formFromArticle(article: Article): EditorForm {
  return {
    title: article.title,
    deck: article.deck ?? '',
    kicker: article.kicker ?? '',
    category: article.category,
    author: article.author,
    tags: article.tags.join(', '),
    featured: article.featured,
    heroImage: article.heroImage ?? null,
    body: article.body,
  }
}

function newBlock(type: BlockType): ContentBlock {
  switch (type) {
    case 'paragraph':
      return { type: 'paragraph', text: '' }
    case 'heading':
      return { type: 'heading', text: '' }
    case 'image':
      return { type: 'image', url: '', alt: '' }
    case 'quote':
      return { type: 'quote', text: '' }
    case 'list':
      return { type: 'list', ordered: false, items: [''] }
    default: {
      const _exhaustive: never = type
      return _exhaustive
    }
  }
}

function toArticleInput(form: EditorForm): ArticleInput {
  return {
    title: form.title,
    deck: form.deck || undefined,
    kicker: form.kicker || undefined,
    category: form.category,
    author: form.author,
    body: form.body,
    heroImage: form.heroImage ?? undefined,
    status: 'draft',
    featured: form.featured,
    tags: form.tags
      .split(',')
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    seo: {},
  }
}

export function Editor() {
  const { id } = useParams<{ id: string }>()
  const isNew = !id || id === 'new'

  if (isNew) {
    return <EditorForm initial={emptyForm()} articleId={null} />
  }

  return <ExistingEditor id={id} />
}

function ExistingEditor({ id }: { id: string }) {
  const { token } = useAuth()
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'articles'],
    queryFn: ({ signal }) => {
      if (!token) throw new Error('Not authenticated')
      return getAdminArticles(token, { limit: 50 }, signal)
    },
    enabled: Boolean(token),
  })

  if (isPending) {
    return <StatusMessage title="Loading editor&hellip;" />
  }
  if (isError) {
    return (
      <StatusMessage
        title="Could not load the article."
        detail={error instanceof Error ? error.message : undefined}
      />
    )
  }

  const article = data.data.find((item) => item.id === id)
  if (!article) {
    return <StatusMessage title="Article not found." />
  }

  return <EditorForm initial={formFromArticle(article)} articleId={id} />
}

interface EditorFormProps {
  initial: EditorForm
  articleId: string | null
}

function EditorForm({ initial, articleId }: EditorFormProps) {
  const { token } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<EditorForm>(initial)
  const [savedId, setSavedId] = useState<string | null>(articleId)

  function update<K extends keyof EditorForm>(key: K, value: EditorForm[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function invalidate() {
    return queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] })
  }

  const save = useMutation({
    mutationFn: async (): Promise<Article> => {
      if (!token) throw new Error('Not authenticated')
      const input = toArticleInput(form)
      if (savedId) {
        return updateArticle(token, savedId, input)
      }
      return createArticle(token, input)
    },
    onSuccess: async (article) => {
      setSavedId(article.id)
      await invalidate()
    },
  })

  const publish = useMutation({
    mutationFn: async (): Promise<Article> => {
      if (!token) throw new Error('Not authenticated')
      const input = toArticleInput(form)
      const saved = savedId
        ? await updateArticle(token, savedId, input)
        : await createArticle(token, input)
      setSavedId(saved.id)
      return publishArticle(token, saved.id)
    },
    onSuccess: async () => {
      await invalidate()
      navigate('/admin', { replace: true })
    },
  })

  const heroUpload = useMutation({
    mutationFn: (file: File) => {
      if (!token) throw new Error('Not authenticated')
      return uploadImage(token, file)
    },
    onSuccess: (response) => {
      setForm((current) => ({
        ...current,
        heroImage: { url: response.url, alt: current.heroImage?.alt ?? '' },
      }))
    },
  })

  const busy = save.isPending || publish.isPending
  const mutationError = save.error ?? publish.error ?? heroUpload.error

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between border-b-3 border-ink pb-4">
        <h1 className="headline text-2xl text-ink">{savedId ? 'Edit Article' : 'New Article'}</h1>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent"
          >
            Back
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => save.mutate()}
            className="label border border-ink px-4 py-2 text-[0.6875rem] text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : 'Save Draft'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => publish.mutate()}
            className="label bg-ink px-4 py-2 text-[0.6875rem] text-paper transition-colors hover:bg-accent disabled:opacity-50"
          >
            {publish.isPending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </header>

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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Author">
            <TextInput value={form.author} onChange={(value) => update('author', value)} />
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

        <BlockEditor blocks={form.body} onChange={(body) => update('body', body)} />
      </div>
    </div>
  )
}

/* ---------- field primitives ---------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label text-[0.625rem] text-ink-soft">{label}</span>
      {children}
    </label>
  )
}

function TextInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
    />
  )
}

function TextArea({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={3}
      className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
    />
  )
}

/* ---------- hero image ---------- */

interface HeroImageFieldProps {
  heroImage: HeroImage | null
  uploading: boolean
  onUpload: (file: File) => void
  onAltChange: (alt: string) => void
  onCaptionChange: (caption: string) => void
  onCreditChange: (credit: string) => void
  onRemove: () => void
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
              const file = event.target.files?.[0]
              if (file) {
                onUpload(file)
              }
            }}
          />
        </label>
      )}
    </fieldset>
  )
}

/* ---------- block editor ---------- */

const BLOCK_TYPES: BlockType[] = ['paragraph', 'heading', 'image', 'quote', 'list']

function BlockEditor({
  blocks,
  onChange,
}: {
  blocks: ContentBlock[]
  onChange: (blocks: ContentBlock[]) => void
}) {
  function replaceAt(index: number, block: ContentBlock) {
    onChange(blocks.map((existing, i) => (i === index ? block : existing)))
  }

  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= blocks.length) {
      return
    }
    const next = [...blocks]
    const [removed] = next.splice(index, 1)
    if (removed) {
      next.splice(target, 0, removed)
      onChange(next)
    }
  }

  function removeAt(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  return (
    <section className="mt-4">
      <h2 className="label mb-3 border-t-3 border-ink pt-2 text-sm text-ink">Body</h2>

      <div className="flex flex-col gap-4">
        {blocks.map((block, index) => (
          <BlockRow
            key={index}
            block={block}
            index={index}
            total={blocks.length}
            onChange={(next) => replaceAt(index, next)}
            onMoveUp={() => move(index, -1)}
            onMoveDown={() => move(index, 1)}
            onRemove={() => removeAt(index)}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {BLOCK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange([...blocks, newBlock(type)])}
            className="label border border-rule px-3 py-2 text-[0.625rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
          >
            + {type}
          </button>
        ))}
      </div>
    </section>
  )
}

interface BlockRowProps {
  block: ContentBlock
  index: number
  total: number
  onChange: (block: ContentBlock) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRemove: () => void
}

function BlockRow({ block, index, total, onChange, onMoveUp, onMoveDown, onRemove }: BlockRowProps) {
  return (
    <div className="border border-rule p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="label text-[0.625rem] text-accent">{block.type}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={onMoveUp}
            aria-label="Move block up"
            className="label text-[0.75rem] text-ink-soft disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            disabled={index === total - 1}
            onClick={onMoveDown}
            aria-label="Move block down"
            className="label text-[0.75rem] text-ink-soft disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label="Remove block"
            className="label text-[0.6875rem] text-muted hover:text-accent"
          >
            ✕
          </button>
        </div>
      </div>
      <BlockFields block={block} onChange={onChange} />
    </div>
  )
}

function BlockFields({ block, onChange }: { block: ContentBlock; onChange: (block: ContentBlock) => void }) {
  switch (block.type) {
    case 'paragraph':
      return <TextArea value={block.text} onChange={(text) => onChange({ ...block, text })} />
    case 'heading':
      return <TextInput value={block.text} onChange={(text) => onChange({ ...block, text })} />
    case 'image':
      return (
        <div className="flex flex-col gap-2">
          <Field label="Image URL">
            <TextInput value={block.url} onChange={(url) => onChange({ ...block, url })} />
          </Field>
          <Field label="Alt text">
            <TextInput value={block.alt} onChange={(alt) => onChange({ ...block, alt })} />
          </Field>
          <Field label="Caption">
            <TextInput
              value={block.caption ?? ''}
              onChange={(caption) => onChange({ ...block, caption })}
            />
          </Field>
          <Field label="Credit">
            <TextInput
              value={block.credit ?? ''}
              onChange={(credit) => onChange({ ...block, credit })}
            />
          </Field>
        </div>
      )
    case 'quote':
      return (
        <div className="flex flex-col gap-2">
          <Field label="Quote">
            <TextArea value={block.text} onChange={(text) => onChange({ ...block, text })} />
          </Field>
          <Field label="Attribution">
            <TextInput
              value={block.attribution ?? ''}
              onChange={(attribution) => onChange({ ...block, attribution })}
            />
          </Field>
        </div>
      )
    case 'list':
      return <ListFields block={block} onChange={onChange} />
    default: {
      const _exhaustive: never = block
      return _exhaustive
    }
  }
}

function ListFields({
  block,
  onChange,
}: {
  block: Extract<ContentBlock, { type: 'list' }>
  onChange: (block: ContentBlock) => void
}) {
  const items = useMemo(() => block.items, [block.items])

  function setItem(index: number, value: string) {
    onChange({ ...block, items: items.map((item, i) => (i === index ? value : item)) })
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="label flex items-center gap-2 text-[0.625rem] text-ink-soft">
        <input
          type="checkbox"
          checked={block.ordered}
          onChange={(event) => onChange({ ...block, ordered: event.target.checked })}
        />
        Ordered list
      </label>
      {items.map((item, index) => (
        <div key={index} className="flex items-center gap-2">
          <TextInput value={item} onChange={(value) => setItem(index, value)} />
          <button
            type="button"
            disabled={items.length <= 1}
            onClick={() => onChange({ ...block, items: items.filter((_, i) => i !== index) })}
            aria-label="Remove list item"
            className="label text-[0.6875rem] text-muted disabled:opacity-30"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange({ ...block, items: [...items, ''] })}
        className="label self-start text-[0.625rem] text-accent"
      >
        + item
      </button>
    </div>
  )
}
