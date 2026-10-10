import { Schema, model, type HydratedDocument, type Model } from 'mongoose'

/**
 * Persisted RSA keypair for ONE local ActivityPub actor, keyed by its local
 * `username` (an edition like `news` or a writer like `eleanorvance`). Each
 * federating actor has its own keypair so it presents a distinct cryptographic
 * identity to the fediverse.
 *
 * The private key is GWJ-owned secret material stored in GWJ's own Mongo. It is
 * never serialized to clients and never logged.
 */
export interface ActorKeyAttrs {
  username: string
  privateKeyPem: string
  publicKeyPem: string
  createdAt: Date
  updatedAt: Date
}

export type ActorKeyDoc = HydratedDocument<ActorKeyAttrs>
export type ActorKeyModelType = Model<ActorKeyAttrs>

const actorKeySchema = new Schema<ActorKeyAttrs, ActorKeyModelType>(
  {
    username: { type: String, required: true, unique: true },
    privateKeyPem: { type: String, required: true },
    publicKeyPem: { type: String, required: true },
  },
  { timestamps: true },
)

export const ActorKeyModel = model<ActorKeyAttrs, ActorKeyModelType>('ActorKey', actorKeySchema)
