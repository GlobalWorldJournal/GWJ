import { z } from 'zod'

/** What the requester is asserting. */
export const TakedownClaimTypeSchema = z.enum(['copyright', 'subject-rights', 'other'])
export type TakedownClaimType = z.infer<typeof TakedownClaimTypeSchema>

export const TakedownStatusSchema = z.enum(['pending', 'actioned', 'dismissed'])
export type TakedownStatus = z.infer<typeof TakedownStatusSchema>

/** Public submission payload — anyone asking for an image or article to come down. */
export const TakedownRequestInputSchema = z.object({
  requesterName: z.string().trim().min(1).max(200),
  requesterEmail: z.string().trim().email(),
  articleUrl: z.string().trim().url().optional(),
  imageUrl: z.string().trim().url().optional(),
  claimType: TakedownClaimTypeSchema,
  explanation: z.string().trim().min(1).max(5000),
  // A real notice-and-takedown process asks the requester to affirm this in
  // good faith; it is not itself a legal determination, just an honesty gate.
  goodFaithAssertion: z.literal(true),
})
export type TakedownRequestInput = z.infer<typeof TakedownRequestInputSchema>

/** Full record returned to admins (dates as ISO strings, `id` not `_id`). */
export const TakedownRequestSchema = TakedownRequestInputSchema.extend({
  id: z.string(),
  status: TakedownStatusSchema,
  /** The article we could match the submitted URL(s) to, if any. */
  articleId: z.string().nullable(),
  resolution: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type TakedownRequestRecord = z.infer<typeof TakedownRequestSchema>

export const TakedownListQuerySchema = z.object({
  status: TakedownStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
export type TakedownListQuery = z.infer<typeof TakedownListQuerySchema>

export const TakedownActionSchema = z.object({
  status: z.enum(['actioned', 'dismissed']),
  resolution: z.string().trim().max(2000).optional(),
  /** Only meaningful when status is "actioned": what to do to the matched article, if any. */
  apply: z.enum(['unpublish', 'clear-hero-image', 'none']).default('none'),
})
export type TakedownAction = z.infer<typeof TakedownActionSchema>

export const PaginatedTakedownRequestsSchema = z.object({
  data: z.array(TakedownRequestSchema),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
  }),
})
export type PaginatedTakedownRequests = z.infer<typeof PaginatedTakedownRequestsSchema>
