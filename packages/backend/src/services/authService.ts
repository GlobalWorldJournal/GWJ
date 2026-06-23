import bcrypt from 'bcryptjs'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { type LoginResponse } from '@gwj/shared-types'
import { UserModel } from '../models/User'
import { UnauthorizedError } from '../errors'

const TOKEN_TTL: SignOptions['expiresIn'] = '12h'

export interface AuthTokenPayload {
  sub: string
  username: string
  role: 'admin'
}

export interface AuthService {
  login(username: string, password: string, jwtSecret: string): Promise<LoginResponse>
  verify(token: string, jwtSecret: string): AuthTokenPayload
}

function isPayload(value: unknown): value is AuthTokenPayload {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return typeof v.sub === 'string' && typeof v.username === 'string' && v.role === 'admin'
}

export const authService: AuthService = {
  async login(username, password, jwtSecret) {
    const user = await UserModel.findOne({ username })
    // Compare even on a missing user is unnecessary here; bcrypt.compare on a
    // bogus hash would still differentiate. We fail uniformly with 401.
    if (!user) throw new UnauthorizedError('Invalid credentials')
    const ok = await bcrypt.compare(password, user.passwordHash)
    if (!ok) throw new UnauthorizedError('Invalid credentials')

    const payload: AuthTokenPayload = {
      sub: user._id.toString(),
      username: user.username,
      role: user.role,
    }
    const token = jwt.sign(payload, jwtSecret, { expiresIn: TOKEN_TTL })
    return { token, user: { username: user.username, role: 'admin' } }
  },

  verify(token, jwtSecret) {
    try {
      const decoded = jwt.verify(token, jwtSecret)
      if (!isPayload(decoded)) throw new UnauthorizedError('Invalid token payload')
      return decoded
    } catch (err) {
      if (err instanceof UnauthorizedError) throw err
      throw new UnauthorizedError('Invalid or expired token')
    }
  },
}
