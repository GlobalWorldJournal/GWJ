import { useRef, useState } from 'react';
import { ArticleBody } from '../../components/ArticleBody';

/** How a toolbar action changes the selected text (or the cursor position). */
interface Edit {
  label: string;
  /** Wrap the selection, or prefix each selected line. */
  apply: (selected: string) => string;
}

const EDITS: readonly Edit[] = [
  { label: 'Subhead', apply: (text) => `## ${text || 'Subhead'}` },
  { label: 'Bold', apply: (text) => `**${text || 'bold'}**` },
  { label: 'Italic', apply: (text) => `*${text || 'italic'}*` },
  {
    label: 'Quote',
    apply: (text) =>
      (text || 'Quotation')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n'),
  },
  {
    label: 'List',
    apply: (text) =>
      (text || 'Item')
        .split('\n')
        .map((line) => `- ${line}`)
        .join('\n'),
  },
  { label: 'Link', apply: (text) => `[${text || 'link text'}](https://)` },
];

interface BodyEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Upload an image to the CDN and resolve its URL. */
  onUploadImage: (file: File) => Promise<string>;
}

/**
 * The article body: Markdown with a small toolbar (subheads, emphasis, quotes,
 * lists, links, and images uploaded to our CDN and placed at the cursor), and
 * a preview rendered exactly as readers will see it.
 */
export function BodyEditor({ value, onChange, onUploadImage }: BodyEditorProps) {
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);

  /** Replace the current selection with `insert`, then select what was inserted. */
  function replaceSelection(make: (selected: string) => string) {
    const element = textarea.current;
    const start = element?.selectionStart ?? value.length;
    const end = element?.selectionEnd ?? value.length;
    const insert = make(value.slice(start, end));
    onChange(value.slice(0, start) + insert + value.slice(end));
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start, start + insert.length);
    });
  }

  async function insertImage(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await onUploadImage(file);
      // On its own paragraph; the alt text is a prompt to describe the image.
      replaceSelection(() => `\n\n![Describe the image](${url})\n\n`);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'The image could not be uploaded.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="mt-4">
      <div className="mb-1 flex items-baseline justify-between border-t-3 border-ink pt-2">
        <h2 className="label text-sm text-ink">Body</h2>
        <fieldset className="m-0 flex gap-3 border-0 p-0">
          <legend className="sr-only">Body view</legend>
          {(['Write', 'Preview'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={preview === (mode === 'Preview')}
              onClick={() => setPreview(mode === 'Preview')}
              className={`label text-[0.6875rem] transition-colors hover:text-accent ${
                preview === (mode === 'Preview') ? 'text-accent' : 'text-ink-soft'
              }`}
            >
              {mode}
            </button>
          ))}
        </fieldset>
      </div>
      <p className="label mb-3 text-[0.625rem] text-muted">
        GitHub-flavored Markdown — headings, lists, links, quotes, images.
      </p>
      {preview ? (
        <div className="border border-rule px-4 py-2">
          <ArticleBody markdown={value} />
        </div>
      ) : (
        <>
          <div role="toolbar" aria-label="Formatting" className="mb-1 flex flex-wrap gap-1">
            {EDITS.map((edit) => (
              <button
                key={edit.label}
                type="button"
                onClick={() => replaceSelection(edit.apply)}
                className="label border border-rule px-2 py-1 text-[0.625rem] text-ink-soft transition-colors hover:border-accent hover:text-accent"
              >
                {edit.label}
              </button>
            ))}
            <label className="label cursor-pointer border border-rule px-2 py-1 text-[0.625rem] text-ink-soft transition-colors hover:border-accent hover:text-accent">
              {uploading ? 'Uploading…' : 'Image'}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void insertImage(file);
                }}
              />
            </label>
          </div>
          {uploadError ? (
            <p role="alert" className="mb-1 font-body text-sm text-accent">
              {uploadError}
            </p>
          ) : null}
          <textarea
            ref={textarea}
            aria-label="Article body (Markdown)"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            rows={20}
            spellCheck
            placeholder={'## A subhead\n\nWrite the story here in Markdown…'}
            className="w-full resize-y border border-ink bg-paper px-3 py-2 font-body text-[1rem] leading-relaxed text-ink outline-none focus:border-accent"
          />
        </>
      )}
    </section>
  );
}
