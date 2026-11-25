import mongoose from 'mongoose'

const googleTokensSchema = new mongoose.Schema(
  {
    access_token: { type: String, default: '' },
    refresh_token: { type: String, default: '' },
    scope: { type: String, default: '' },
    token_type: { type: String, default: '' },
    expiry_date: { type: Number, default: 0 },
    email: { type: String, default: '' },
  },
  { _id: false }
)

const smtpConfigSchema = new mongoose.Schema(
  {
    email: { type: String, default: '' },
    appPassword: { type: String, default: '' },
    host: { type: String, default: 'smtp.gmail.com' },
    port: { type: Number, default: 465 },
    secure: { type: Boolean, default: true },
  },
  { _id: false }
)

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    googleTokens: {
      type: googleTokensSchema,
      default: () => ({}),
    },
    smtpConfig: {
      type: smtpConfigSchema,
      default: () => ({}),
    },
  },
  { timestamps: true }
)

userSchema.methods.toSafeProfile = function toSafeProfile() {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    googleConnected: Boolean(
      this.googleTokens?.refresh_token || this.googleTokens?.access_token
    ),
    googleEmail: this.googleTokens?.email || '',
    smtpConnected: Boolean(this.smtpConfig?.email && this.smtpConfig?.appPassword),
    smtpEmail: this.smtpConfig?.email || '',
    smtpHost: this.smtpConfig?.host || 'smtp.gmail.com',
    createdAt: this.createdAt,
  }
}

export const User = mongoose.model('User', userSchema)
