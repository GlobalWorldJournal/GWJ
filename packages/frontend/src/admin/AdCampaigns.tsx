import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AD_CREATIVE_MIN_HEIGHT,
  AD_CREATIVE_MIN_WIDTH,
  AD_VARIANTS,
  type AdCampaign,
  type AdCampaignInput,
  type AdCampaignStatus,
  type AdVariant,
} from '@gwj/shared-types';
import {
  createAdCampaign,
  deleteAdCampaign,
  getAdminAdCampaigns,
  updateAdCampaign,
  uploadAdCreative,
} from '../lib/api';
import { useAuth } from './useAuth';
import { StatusMessage } from '../components/StatusMessage';

const STATUS_FILTERS: { value: AdCampaignStatus | undefined; label: string }[] = [
  { value: undefined, label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'cancelled', label: 'Cancelled' },
];

const VARIANT_LABELS: Record<AdVariant, string> = {
  leaderboard: 'Leaderboard (728×90)',
  mrec: 'Medium rectangle (300×250)',
  inline: 'In-feed (full column width)',
};

const MS_PER_MINUTE = 60_000;
const DAYS_IN_DEFAULT_WINDOW = 30;
const MS_PER_DAY = 24 * 60 * MS_PER_MINUTE;

/** An instant as the value of a `datetime-local` input, in the admin's own time zone. */
function toLocalInput(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * MS_PER_MINUTE)
    .toISOString()
    .slice(0, 16);
}

/** A `datetime-local` value (local wall time, no zone) as an ISO instant. */
function fromLocalInput(value: string): string {
  return new Date(value).toISOString();
}

interface FormState {
  advertiserName: string;
  advertiserEmail: string;
  imageUrl: string;
  clickUrl: string;
  variant: AdVariant;
  startsAt: string;
  endsAt: string;
  status: AdCampaignStatus;
}

function emptyForm(now: Date = new Date()): FormState {
  return {
    advertiserName: '',
    advertiserEmail: '',
    imageUrl: '',
    clickUrl: '',
    variant: 'mrec',
    startsAt: toLocalInput(now),
    endsAt: toLocalInput(new Date(now.getTime() + DAYS_IN_DEFAULT_WINDOW * MS_PER_DAY)),
    status: 'active',
  };
}

function formFromCampaign(campaign: AdCampaign): FormState {
  return {
    advertiserName: campaign.advertiserName,
    advertiserEmail: campaign.advertiserEmail,
    imageUrl: campaign.imageUrl,
    clickUrl: campaign.clickUrl,
    variant: campaign.variant,
    startsAt: toLocalInput(new Date(campaign.startsAt)),
    endsAt: toLocalInput(new Date(campaign.endsAt)),
    status: campaign.status,
  };
}

function formToInput(form: FormState): AdCampaignInput {
  return {
    advertiserName: form.advertiserName,
    advertiserEmail: form.advertiserEmail,
    imageUrl: form.imageUrl,
    clickUrl: form.clickUrl,
    variant: form.variant,
    startsAt: fromLocalInput(form.startsAt),
    endsAt: fromLocalInput(form.endsAt),
    status: form.status,
  };
}

/** Serving right now: active and inside its window. */
function isLive(campaign: AdCampaign, now: number): boolean {
  return (
    campaign.status === 'active' &&
    Date.parse(campaign.startsAt) <= now &&
    now < Date.parse(campaign.endsAt)
  );
}

export function AdCampaigns() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AdCampaignStatus | undefined>(undefined);
  const [form, setForm] = useState<FormState>(() => emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data, isPending, isError, error } = useQuery({
    queryKey: ['admin', 'ad-campaigns', status],
    queryFn: ({ signal }) => {
      if (!token) throw new Error('Not authenticated');
      return getAdminAdCampaigns(token, { status, limit: 50 }, signal);
    },
    enabled: Boolean(token),
  });

  function invalidate() {
    return Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'ad-campaigns'] }),
      // The reader-side slot answer, cached in this same SPA.
      queryClient.invalidateQueries({ queryKey: ['ad-campaign', 'active'] }),
    ]);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm());
  }

  const save = useMutation({
    mutationFn: () => {
      if (!token) throw new Error('Not authenticated');
      const input = formToInput(form);
      return editingId ? updateAdCampaign(token, editingId, input) : createAdCampaign(token, input);
    },
    onSuccess: async () => {
      resetForm();
      await invalidate();
    },
  });

  const setCampaignStatus = useMutation({
    mutationFn: (vars: { id: string; status: AdCampaignStatus }) => {
      if (!token) throw new Error('Not authenticated');
      return updateAdCampaign(token, vars.id, { status: vars.status });
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!token) throw new Error('Not authenticated');
      return deleteAdCampaign(token, id);
    },
    onSuccess: async (_result, id) => {
      if (editingId === id) resetForm();
      await invalidate();
    },
  });

  const creativeUpload = useMutation({
    mutationFn: (file: File) => {
      if (!token) throw new Error('Not authenticated');
      return uploadAdCreative(token, file);
    },
    onSuccess: (response) => update('imageUrl', response.url),
  });

  const busy =
    save.isPending || setCampaignStatus.isPending || remove.isPending || creativeUpload.isPending;
  const mutationError =
    save.error ?? setCampaignStatus.error ?? remove.error ?? creativeUpload.error;
  const now = Date.now();

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-center justify-between border-b-3 border-ink pb-4">
        <div>
          <p className="kicker">Advertising</p>
          <h1 className="headline text-3xl text-ink">Direct Ad Campaigns</h1>
        </div>
        <Link
          to="/admin"
          className="label text-[0.75rem] text-ink-soft transition-colors hover:text-accent"
        >
          Back to Dashboard
        </Link>
      </header>

      <p className="mb-6 font-body text-[0.95rem] text-ink-soft">
        A campaign that is active and inside its dates replaces AdSense in every slot of its type.
        If two overlap, the most recently created one is shown. Payment is arranged directly with
        the advertiser; schedule the campaign here once it is settled.
      </p>

      {mutationError ? (
        <p className="mb-4 text-[0.85rem] text-accent">
          {mutationError instanceof Error ? mutationError.message : 'Something went wrong.'}
        </p>
      ) : null}

      <form
        className="mb-10 flex flex-col gap-4 border border-rule p-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <h2 className="label text-sm text-ink">{editingId ? 'Edit Campaign' : 'New Campaign'}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Advertiser">
            <TextInput
              value={form.advertiserName}
              onChange={(value) => update('advertiserName', value)}
            />
          </Field>
          <Field label="Advertiser contact email">
            <TextInput
              type="email"
              value={form.advertiserEmail}
              onChange={(value) => update('advertiserEmail', value)}
            />
          </Field>
          <Field label="Click-through URL">
            <TextInput
              type="url"
              value={form.clickUrl}
              onChange={(value) => update('clickUrl', value)}
            />
          </Field>
          <Field label="Slot">
            <select
              value={form.variant}
              onChange={(event) => update('variant', event.target.value as AdVariant)}
              className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
            >
              {AD_VARIANTS.map((variant) => (
                <option key={variant} value={variant}>
                  {VARIANT_LABELS[variant]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Starts">
            <TextInput
              type="datetime-local"
              value={form.startsAt}
              onChange={(value) => update('startsAt', value)}
            />
          </Field>
          <Field label="Ends">
            <TextInput
              type="datetime-local"
              value={form.endsAt}
              onChange={(value) => update('endsAt', value)}
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(event) => update('status', event.target.value as AdCampaignStatus)}
              className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
            >
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              {editingId ? <option value="cancelled">Cancelled</option> : null}
            </select>
          </Field>
        </div>

        <fieldset className="border border-rule p-4">
          <legend className="label px-2 text-[0.625rem] text-ink-soft">Creative</legend>
          {form.imageUrl ? (
            <img
              src={form.imageUrl}
              alt={`Creative for ${form.advertiserName || 'this campaign'}`}
              className="mb-3 max-h-64 max-w-full object-contain"
            />
          ) : null}
          <label className="label inline-flex cursor-pointer items-center gap-2 text-[0.6875rem] text-ink">
            <span className="border border-ink px-3 py-2 transition-colors hover:border-accent hover:text-accent">
              {creativeUpload.isPending
                ? 'Uploading…'
                : form.imageUrl
                  ? 'Replace image'
                  : 'Upload image'}
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={creativeUpload.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) creativeUpload.mutate(file);
              }}
            />
          </label>
          <p className="mt-2 text-[0.8rem] text-muted">
            At least {AD_CREATIVE_MIN_WIDTH}×{AD_CREATIVE_MIN_HEIGHT}px; sized for the chosen slot.
          </p>
        </fieldset>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !form.imageUrl}
            className="label bg-ink px-4 py-2 text-[0.6875rem] text-paper transition-colors hover:bg-accent disabled:opacity-50"
          >
            {save.isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Schedule Campaign'}
          </button>
          {editingId ? (
            <button
              type="button"
              onClick={resetForm}
              className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent"
            >
              Cancel Editing
            </button>
          ) : null}
        </div>
      </form>

      <div className="mb-6 flex gap-4">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setStatus(f.value)}
            className={`label text-[0.7rem] ${status === f.value ? 'text-accent' : 'text-ink-soft'} transition-colors hover:text-accent`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <StatusMessage title="Loading campaigns…" />
      ) : isError ? (
        <StatusMessage
          title="Could not load campaigns."
          detail={error instanceof Error ? error.message : undefined}
        />
      ) : data.data.length === 0 ? (
        <StatusMessage title="No campaigns here." />
      ) : (
        <ul className="flex flex-col divide-y divide-rule border-t border-rule">
          {data.data.map((campaign) => (
            <li key={campaign.id} className="flex gap-4 py-4">
              <img
                src={campaign.imageUrl}
                alt={`Creative for ${campaign.advertiserName}`}
                className="h-20 w-32 shrink-0 object-contain"
              />
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`label text-[0.625rem] ${isLive(campaign, now) ? 'text-accent' : 'text-muted'}`}
                  >
                    {isLive(campaign, now) ? 'Live' : campaign.status}
                  </span>
                  <span className="label text-[0.625rem] text-muted">
                    {VARIANT_LABELS[campaign.variant]}
                  </span>
                </div>
                <p className="font-body text-ink">
                  <span className="font-bold">{campaign.advertiserName}</span> (
                  {campaign.advertiserEmail})
                </p>
                <p className="label text-[0.7rem] text-muted">
                  {new Date(campaign.startsAt).toLocaleString()} –{' '}
                  {new Date(campaign.endsAt).toLocaleString()}
                </p>
                <p className="label break-all text-[0.7rem] text-muted">{campaign.clickUrl}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditingId(campaign.id);
                      setForm(formFromCampaign(campaign));
                    }}
                    className="label text-[0.6875rem] text-ink transition-colors hover:text-accent disabled:opacity-50"
                  >
                    Edit
                  </button>
                  {campaign.status === 'active' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setCampaignStatus.mutate({ id: campaign.id, status: 'paused' })
                      }
                      className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
                    >
                      Pause
                    </button>
                  ) : null}
                  {campaign.status === 'paused' ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        setCampaignStatus.mutate({ id: campaign.id, status: 'active' })
                      }
                      className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
                    >
                      Resume
                    </button>
                  ) : null}
                  {campaign.status === 'cancelled' ? null : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Cancel the ${campaign.advertiserName} campaign? It cannot be resumed.`,
                          )
                        )
                          setCampaignStatus.mutate({ id: campaign.id, status: 'cancelled' });
                      }}
                      className="label text-[0.6875rem] text-accent transition-colors hover:text-ink disabled:opacity-50"
                    >
                      Cancel Campaign
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Delete the ${campaign.advertiserName} campaign? This cannot be undone.`,
                        )
                      )
                        remove.mutate(campaign.id);
                    }}
                    className="label text-[0.6875rem] text-ink-soft transition-colors hover:text-accent disabled:opacity-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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

function TextInput({
  value,
  onChange,
  type = 'text',
}: {
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'url' | 'datetime-local';
}) {
  return (
    <input
      type={type}
      required
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border border-ink bg-paper px-3 py-2 font-body text-ink outline-none focus:border-accent"
    />
  );
}
