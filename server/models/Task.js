import mongoose from 'mongoose'

const planStepSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, default: '', trim: true, maxlength: 600 },
    toolHint: { type: String, default: '', trim: true, maxlength: 80 },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
    },
  },
  { _id: false }
)

const traceEntrySchema = new mongoose.Schema(
  {
    stepIndex: { type: Number, required: true },
    type: {
      type: String,
      enum: [
        'plan',
        'reasoning',
        'tool_call',
        'retry',
        'fallback',
        'approval',
        'error',
        'system',
      ],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    toolName: { type: String, default: '' },
    input: { type: mongoose.Schema.Types.Mixed, default: null },
    output: { type: mongoose.Schema.Types.Mixed, default: null },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      required: true,
    },
    attempts: { type: Number, default: 1 },
    durationMs: { type: Number, default: 0 },
    error: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
)

const emailDraftSchema = new mongoose.Schema(
  {
    recipientName: { type: String, default: '', trim: true, maxlength: 150 },
    recipientEmail: { type: String, default: '', trim: true, maxlength: 254 },
    recipientType: {
      type: String,
      enum: ['official', 'unofficial'],
      default: 'official',
    },
    cc: { type: [String], default: [] },
    subject: { type: String, default: '', trim: true, maxlength: 300 },
    body: { type: String, default: '', maxlength: 20000 },
    gmailDraftId: { type: String, default: '' },
    gmailMessageId: { type: String, default: '' },
    gmailThreadId: { type: String, default: '' },
    gmailDraftCreated: { type: Boolean, default: false },
    deliveryMethod: {
      type: String,
      enum: ['none', 'gmail_oauth', 'smtp', 'ethereal_sandbox'],
      default: 'none',
    },
    previewUrl: { type: String, default: '' },
    approvalStatus: {
      type: String,
      enum: ['none', 'pending_approval', 'approved_and_sent', 'rejected'],
      default: 'none',
    },
    approvedAt: { type: Date, default: null },
    sentAt: { type: Date, default: null },
    error: { type: String, default: '' },
  },
  { _id: false }
)

const taskSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    goal: {
      type: String,
      required: true,
      trim: true,
      maxlength: 2000,
    },
    status: {
      type: String,
      enum: ['pending', 'running', 'completed', 'failed'],
      default: 'pending',
      index: true,
    },
    plan: {
      type: [planStepSchema],
      default: [],
    },
    trace: {
      type: [traceEntrySchema],
      default: [],
    },
    emailDraft: {
      type: emailDraftSchema,
      default: () => ({}),
    },
    finalSummary: {
      type: String,
      default: '',
    },
    error: {
      type: String,
      default: '',
    },
    stoppedByUser: {
      type: Boolean,
      default: false,
    },
    startedAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
)

export const Task = mongoose.model('Task', taskSchema)

