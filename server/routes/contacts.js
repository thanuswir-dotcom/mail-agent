import express from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/auth.js'
import {
  createContact,
  deleteContact,
  isValidId,
  listContacts,
  seedContacts,
  updateContact,
} from '../services/dbStore.js'

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
    const contacts = await listContacts(req.user._id, q)
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

    const contact = await createContact(req.user._id, parsed.data)
    return res.status(201).json({ contact })
  } catch (error) {
    if (error?.code === '23505' || error?.code === 11000) {
      return res.status(409).json({ error: 'A contact with this email already exists.' })
    }
    return res.status(500).json({ error: 'Failed to create contact.', message: error.message })
  }
})

router.put('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid contact ID.' })
    }
    const parsed = contactSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0]?.message || 'Invalid contact payload',
      })
    }

    const updated = await updateContact(req.params.id, req.user._id, parsed.data)
    if (!updated) {
      return res.status(404).json({ error: 'Contact not found.' })
    }
    return res.json({ contact: updated })
  } catch (error) {
    if (error?.code === '23505' || error?.code === 11000) {
      return res.status(409).json({ error: 'A contact with this email already exists.' })
    }
    return res.status(500).json({ error: 'Failed to update contact.', message: error.message })
  }
})

router.delete('/:id', async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ error: 'Invalid contact ID.' })
    }
    const deleted = await deleteContact(req.params.id, req.user._id)
    if (!deleted) {
      return res.status(404).json({ error: 'Contact not found.' })
    }
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

    const contacts = await seedContacts(req.user._id, starterContacts)
    return res.json({ contacts })
  } catch (error) {
    return res.status(500).json({ error: 'Failed to seed sample contacts.', message: error.message })
  }
})

export default router
