import { Router, type Request, type Response } from 'express'
import multer from 'multer'
import {
  ArticleInputSchema,
  ArticleListQuerySchema,
  ArticleUpdateSchema,
  TakedownActionSchema,
  TakedownListQuerySchema,
  type ArticleInput,
  type ArticleListQuery,
  type ArticleUpdate,
  type TakedownAction,
  type TakedownListQuery,
} from '@gwj/shared-types'
import { validateImageBuffer } from '@gwj/shared-types/image-validation'
import { articleService } from '../services/articleService'
import { takedownService } from '../services/takedownService'
import { type UploadService } from '../services/uploadService'
import { requireAuth } from '../middleware/auth'
import { validate } from '../middleware/validate'
import { requireParam } from '../middleware/params'
import { BadRequestError, UnprocessableEntityError } from '../errors'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export function createAdminRouter(jwtSecret: string, uploadService: UploadService): Router {
  const router = Router()
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
  })

  router.use(requireAuth(jwtSecret))

  router.get(
    '/articles',
    validate(ArticleListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const query = req.validatedQuery as ArticleListQuery
      // Admin listing shows ALL statuses (incl. drafts) unless one is explicitly requested.
      const result = await articleService.list(query, { includeAll: true })
      res.json(result)
    },
  )

  router.post('/articles', validate(ArticleInputSchema), async (req: Request, res: Response) => {
    const article = await articleService.create(req.body as ArticleInput)
    res.status(201).json(article)
  })

  // Registered BEFORE `/articles/:id` so the literal `by-slug` segment is not
  // captured by the `:id` param. Both single-get routes include drafts.
  router.get('/articles/by-slug/:slug', async (req: Request, res: Response) => {
    const article = await articleService.getBySlug(requireParam(req, 'slug'), { includeDrafts: true })
    res.json(article)
  })

  router.get('/articles/:id', async (req: Request, res: Response) => {
    const article = await articleService.getById(requireParam(req, 'id'))
    res.json(article)
  })

  router.patch(
    '/articles/:id',
    validate(ArticleUpdateSchema),
    async (req: Request, res: Response) => {
      const article = await articleService.update(requireParam(req, 'id'), req.body as ArticleUpdate)
      res.json(article)
    },
  )

  router.delete('/articles/:id', async (req: Request, res: Response) => {
    await articleService.remove(requireParam(req, 'id'))
    res.status(204).end()
  })

  router.post('/articles/:id/publish', async (req: Request, res: Response) => {
    const article = await articleService.publish(requireParam(req, 'id'))
    res.json(article)
  })

  router.post('/articles/:id/unpublish', async (req: Request, res: Response) => {
    const article = await articleService.unpublish(requireParam(req, 'id'))
    res.json(article)
  })

  router.post('/upload', upload.single('file'), async (req: Request, res: Response) => {
    const file = req.file
    if (!file) throw new BadRequestError('No file uploaded (expected field "file")')

    // Validate at the request boundary so a bad upload gets an actionable 422
    // (the agent/admin can re-source the image) before any S3 work. The upload
    // service validates again as the authoritative last line of defense.
    // Defaults enforce the canonical min width/height and byte cap.
    const validation = validateImageBuffer(file.buffer, { declaredMime: file.mimetype })
    if (!validation.ok) {
      throw new UnprocessableEntityError(`Rejected image upload: ${validation.message}`, {
        reason: validation.reason,
      })
    }

    const result = await uploadService.uploadImage(file.buffer, file.originalname, file.mimetype)
    res.status(201).json(result)
  })

  router.get(
    '/takedown-requests',
    validate(TakedownListQuerySchema, 'query'),
    async (req: Request, res: Response) => {
      const query = req.validatedQuery as TakedownListQuery
      const result = await takedownService.list(query)
      res.json(result)
    },
  )

  router.get('/takedown-requests/:id', async (req: Request, res: Response) => {
    const record = await takedownService.getById(requireParam(req, 'id'))
    res.json(record)
  })

  router.post(
    '/takedown-requests/:id/action',
    validate(TakedownActionSchema),
    async (req: Request, res: Response) => {
      const record = await takedownService.action(requireParam(req, 'id'), req.body as TakedownAction)
      res.json(record)
    },
  )

  return router
}
