import { Schema, model, Types, type HydratedDocument, type Model } from 'mongoose'
import { type TakedownClaimType, type TakedownRequestRecord, type TakedownStatus } from '@gwj/shared-types'

/** Persistence shape of a takedown request. `articleId` is a real ref, not the DTO's plain string. */
export interface TakedownRequestAttrs {
  requesterName: string
  requesterEmail: string
  articleUrl?: string
  imageUrl?: string
  claimType: TakedownClaimType
  explanation: string
  goodFaithAssertion: true
  status: TakedownStatus
  articleId: Types.ObjectId | null
  resolution?: string
  createdAt: Date
  updatedAt: Date
}

export type TakedownRequestDoc = HydratedDocument<TakedownRequestAttrs>
export type TakedownRequestModelType = Model<TakedownRequestAttrs>

const takedownRequestSchema = new Schema<TakedownRequestAttrs, TakedownRequestModelType>(
  {
    requesterName: { type: String, required: true },
    requesterEmail: { type: String, required: true },
    articleUrl: { type: String },
    imageUrl: { type: String },
    claimType: { type: String, enum: ['copyright', 'subject-rights', 'other'], required: true },
    explanation: { type: String, required: true },
    goodFaithAssertion: { type: Boolean, required: true },
    status: { type: String, enum: ['pending', 'actioned', 'dismissed'], default: 'pending', required: true },
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', default: null },
    resolution: { type: String },
  },
  { timestamps: true, minimize: false },
)

takedownRequestSchema.index({ status: 1, createdAt: -1 })

export const TakedownRequestModel = model<TakedownRequestAttrs, TakedownRequestModelType>(
  'TakedownRequest',
  takedownRequestSchema,
)

/** Map a hydrated document to its public/admin DTO (`_id`→`id`, Dates→ISO). */
export function takedownRequestToDTO(doc: TakedownRequestDoc): TakedownRequestRecord {
  return {
    id: doc._id.toString(),
    requesterName: doc.requesterName,
    requesterEmail: doc.requesterEmail,
    articleUrl: doc.articleUrl,
    imageUrl: doc.imageUrl,
    claimType: doc.claimType,
    explanation: doc.explanation,
    goodFaithAssertion: true,
    status: doc.status,
    // Stored as an ObjectId ref (so Mongoose can validate/populate it); the DTO's
    // contract is a plain string, same as every other id this API returns.
    articleId: doc.articleId ? doc.articleId.toString() : null,
    resolution: doc.resolution,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  }
}
