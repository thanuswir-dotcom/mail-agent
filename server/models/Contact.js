import mongoose from 'mongoose'

const contactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    company: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
    },
    role: {
      type: String,
      trim: true,
      default: '',
      maxlength: 120,
    },
    relationshipType: {
      type: String,
      enum: ['official', 'unofficial'],
      default: 'official',
    },
    notes: {
      type: String,
      trim: true,
      default: '',
      maxlength: 500,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
)

contactSchema.index({ userId: 1, email: 1 }, { unique: true })

export const Contact = mongoose.model('Contact', contactSchema)
