import express from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { Contact } from '../models/Contact.js'
import { requireAuth } from '../middleware/auth.js'
import {
  deleteContactFromSupabase,
  syncContactsToSupabase,
  syncContactToSupabase,
} from '../services/supabaseService.js'

const router = express.Router()

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().email('Valid email is required').toLowerCase(),
  company: z.string().trim().max(120).optional().default(''),
  role: z.string().trim().max(120).optional().default(''),
  relationshipType: z
    .enum(['official', 'unofficial'])
    .optional()
    .default('official'),
  notes: z.string().trim().max(500).optional().default(''),
  tags: z.array(z.string().trim().max(40)).max(10).optional().default([]),
})

router.use(requireAuth)

router.get('/', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim()
    const filter = { userId: req.user._id }
    if (q) {
      const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      filter.$or = [
        { name: regex },
        { email: regex },
        { company: regex },
        { role: regex },
        { tags: regex },
      ]
    }
    const contacts = await Contact.find(filter).sort({ name: 1 }).lean()
    return res.json({ contacts })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to load contacts.', message: error.message })
  }
})

router.post('/', async (req, res) => {
  try {
    const parsed = contactSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid contact payload',
        details: parsed.error.issues,
      })
    }

    const contact = await Contact.create({
      ...parsed.data,
      userId: req.user._id,
    })
    void syncContactToSupabase(contact, req.user)
    return res.status(201).json({ contact })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'A contact with this email already exists.' })
    }
    return res.status(500).json({ error: 'Failed to create contact.', message: error.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid contact ID.' })
    }
    const parsed = contactSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid contact payload',
      })
    }

    const updated = await Contact.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      parsed.data,
      { new: true, runValidators: true }
    )
    if (!updated) {
      return res.status(404).json({ error: 'Contact not found.' })
    }
    void syncContactToSupabase(updated, req.user)
    return res.json({ contact: updated })
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ error: 'A contact with this email already exists.' })
    }
    return res.status(500).json({ error: 'Failed to update contact.', message: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid contact ID.' })
    }
    const deleted = await Contact.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    })
    if (!deleted) {
      return res.status(404).json({ error: 'Contact not found.' })
    }
    void deleteContactFromSupabase(req.params.id)
    return res.json({ deletedId: req.params.id })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to delete contact.', message: error.message })
  }
})

router.post('/seed', async (req, res) => {
  try {
    const starterContacts = [
      {
        name: 'Sarah Chen',
        email: 'sarah.chen@acme-design.example.com',
        company: 'Acme Design',
        role: 'Lead Product Designer',
        relationshipType: 'official',
        notes: 'Prefers afternoon syncs (2pm-5pm)',
        tags: ['design', 'product'],
      },
      {
        name: 'Marcus Rivera',
        email: 'marcus.rivera@acme-eng.example.com',
        company: 'Acme Engineering',
        role: 'Backend Tech Lead',
        relationshipType: 'official',
        notes: 'Handles API architecture and deployments',
        tags: ['engineering', 'api'],
      },
      {
        name: 'Priya Nair',
        email: 'priya.nair@northstar.example.com',
        company: 'Northstar Ventures',
        role: 'Partner',
        relationshipType: 'official',
        notes: 'Investor update recipient',
        tags: ['investor', 'external'],
      },
      {
        name: 'Bhuvana',
        email: 'kethireddybhuvana69@gmail.com',
        company: '',
        role: 'Close Friend',
        relationshipType: 'unofficial',
        notes: 'Friendly/casual messages with extra emojis',
        tags: ['friend', 'unofficial'],
      },
    ]

    const inserted = []
    for (const item of starterContacts) {
      const doc = await Contact.findOneAndUpdate(
        { userId: req.user._id, email: item.email },
        { $setOnInsert: { ...item, userId: req.user._id } },
        { upsert: true, new: true }
      )
      inserted.push(doc)
    }

    void syncContactsToSupabase(inserted, req.user)
    return res.json({ contacts: inserted })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to seed sample contacts.', message: error.message })
  }
})

export default router

