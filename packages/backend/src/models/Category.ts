import { Schema, model, type Model } from 'mongoose'
import { type Category } from '@gwj/shared-types'

export interface CategoryAttrs {
  slug: string
  name: Category
  order: number
}

export type CategoryModelType = Model<CategoryAttrs>

const categorySchema = new Schema<CategoryAttrs, CategoryModelType>({
  slug: { type: String, required: true, unique: true },
  name: { type: String, required: true, unique: true },
  order: { type: Number, required: true, default: 0 },
})

export const CategoryModel = model<CategoryAttrs, CategoryModelType>('Category', categorySchema)
