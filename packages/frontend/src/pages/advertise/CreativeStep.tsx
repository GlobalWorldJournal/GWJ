import { useMutation } from '@tanstack/react-query';
import {
  AD_CREATIVE_ASPECT_RATIOS,
  AD_CREATIVE_MIN_HEIGHT,
  AD_CREATIVE_MIN_WIDTH,
} from '@gwj/shared-types';
import type { AdVariant } from '@gwj/shared-types';
import { uploadAdvertiserCreative } from '../../lib/api';
import { creativeProblem, measureImage, type CreativeProblem } from '../../lib/creative';
import { fill, type AdvertiseCopy } from './copy';
import { SlotShape } from './SlotShape';
import { BUTTON_QUIET_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS } from './ui';

/** A creative rejected in the browser, before any upload. */
class CreativeProblemError extends Error {
  readonly problem: CreativeProblem;

  constructor(problem: CreativeProblem) {
    super(problem);
    this.name = 'CreativeProblemError';
    this.problem = problem;
  }
}

function shapeLabel(variant: AdVariant, copy: AdvertiseCopy): string {
  const ratio = AD_CREATIVE_ASPECT_RATIOS[variant];
  return ratio ? `${ratio.width} × ${ratio.height}` : copy.slots[variant].size;
}

interface CreativeStepProps {
  copy: AdvertiseCopy;
  token: string;
  variant: AdVariant;
  imageUrl: string | null;
  onImage: (url: string | null) => void;
  clickUrl: string;
  onClickUrl: (value: string) => void;
  adName: string;
  onAdName: (value: string) => void;
  clickUrlValid: boolean;
}

/** Upload, check the shape, preview inside the real slot, and name the ad. */
export function CreativeStep({
  copy,
  token,
  variant,
  imageUrl,
  onImage,
  clickUrl,
  onClickUrl,
  adName,
  onAdName,
  clickUrlValid,
}: CreativeStepProps) {
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const { width, height } = await measureImage(file);
      const problem = creativeProblem(
        { type: file.type, bytes: file.size, width, height },
        variant,
      );
      if (problem) throw new CreativeProblemError(problem);
      return uploadAdvertiserCreative(token, file, variant);
    },
    onSuccess: (response) => onImage(response.url),
  });

  let errorText: string | null = null;
  if (upload.error instanceof CreativeProblemError) {
    errorText = fill(copy.creativeProblems[upload.error.problem], {
      width: AD_CREATIVE_MIN_WIDTH,
      height: AD_CREATIVE_MIN_HEIGHT,
      shape: shapeLabel(variant, copy),
    });
  } else if (upload.error) {
    errorText = copy.uploadFailed;
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className={`${BUTTON_QUIET_CLASS} cursor-pointer`}>
          {upload.isPending ? copy.uploading : imageUrl ? copy.replaceImage : copy.uploadImage}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            data-testid="creative-file"
            className="sr-only"
            disabled={upload.isPending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload.mutate(file);
              event.target.value = '';
            }}
          />
        </label>
        <p className="mt-2 font-label text-[0.8rem] text-muted">
          {fill(copy.creativeHelp, { shape: shapeLabel(variant, copy) })}
        </p>
        {errorText ? (
          <p role="alert" className="mt-2 font-label text-[0.85rem] text-accent">
            {errorText}
          </p>
        ) : null}
      </div>

      <div>
        <p className={FIELD_LABEL_CLASS}>{copy.previewTitle}</p>
        <div className="mt-2 max-w-xl">
          <SlotShape variant={variant} imageUrl={imageUrl ?? undefined} alt={adName} />
        </div>
      </div>

      <label className="flex max-w-xl flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>{copy.destinationUrl}</span>
        <input
          type="url"
          className={INPUT_CLASS}
          value={clickUrl}
          maxLength={2000}
          placeholder="https://"
          onChange={(event) => onClickUrl(event.target.value)}
        />
        <span className="font-label text-[0.75rem] text-muted">{copy.destinationHelp}</span>
        {clickUrl !== '' && !clickUrlValid ? (
          <span role="alert" className="font-label text-[0.8rem] text-accent">
            {copy.httpsOnly}
          </span>
        ) : null}
      </label>

      <label className="flex max-w-xl flex-col gap-1">
        <span className={FIELD_LABEL_CLASS}>{copy.adName}</span>
        <input
          className={INPUT_CLASS}
          value={adName}
          maxLength={200}
          onChange={(event) => onAdName(event.target.value)}
        />
        <span className="font-label text-[0.75rem] text-muted">{copy.adNameHelp}</span>
      </label>
    </div>
  );
}
