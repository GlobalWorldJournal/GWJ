import { Schema, model, type HydratedDocument, type Model } from 'mongoose'

export interface UserAttrs {
  username: string
  passwordHash: string
  role: 'admin'
  createdAt: Date
}

export type UserDoc = HydratedDocument<UserAttrs>
export type UserModelType = Model<UserAttrs>

const userSchema = new Schema<UserAttrs, UserModelType>({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin'], default: 'admin', required: true },
  createdAt: { type: Date, default: () => new Date() },
})

export const UserModel = model<UserAttrs, UserModelType>('User', userSchema)
