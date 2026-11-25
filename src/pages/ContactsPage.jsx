import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Search, Sparkles, Trash2 } from 'lucide-react'
import { api, extractApiError } from '../api/client'
import { Navbar } from '../components/Navbar'

const EMPTY_FORM = {
  name: '',
  email: '',
  company: '',
  role: '',
  relationshipType: 'official',
  tags: '',
  notes: '',
}

export function ContactsPage() {
  const [contacts, setContacts] = useState([])
  const [searchQuery, setSearchQuery] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [error, setError] = useState('')

  const loadContacts = useCallback(async (q = '') => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/contacts', { params: q ? { q } : {} })
      setContacts(res.data.contacts || [])
    } catch (err) {
      setError(extractApiError(err, 'Failed to load contacts.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api
      .get('/contacts')
      .then((res) => {
        if (!cancelled) {
          setContacts(res.data.contacts || [])
          setError('')
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(extractApiError(err, 'Failed to load contacts.'))
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    loadContacts(searchQuery.trim())
  }

  const handleSaveContact = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim(),
      role: form.role.trim(),
      relationshipType: form.relationshipType,
      notes: form.notes.trim(),
      tags: form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    }

    try {
      if (editingId) {
        await api.put(`/contacts/${editingId}`, payload)
      } else {
        await api.post('/contacts', payload)
      }
      setForm(EMPTY_FORM)
      setEditingId('')
      await loadContacts(searchQuery.trim())
    } catch (err) {
      setError(extractApiError(err, 'Failed to save contact.'))
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (contact) => {
    setEditingId(contact._id)
    setForm({
      name: contact.name || '',
      email: contact.email || '',
      company: contact.company || '',
      role: contact.role || '',
      relationshipType: contact.relationshipType === 'unofficial' ? 'unofficial' : 'official',
      tags: (contact.tags || []).join(', '),
      notes: contact.notes || '',
    })
  }

  const handleDelete = async (id) => {
    setError('')
    try {
      await api.delete(`/contacts/${id}`)
      setContacts((prev) => prev.filter((c) => c._id !== id))
      if (editingId === id) {
        setEditingId('')
        setForm(EMPTY_FORM)
      }
    } catch (err) {
      setError(extractApiError(err, 'Failed to delete contact.'))
    }
  }

  const handleSeed = async () => {
    setSeeding(true)
    setError('')
    try {
      await api.post('/contacts/seed')
      await loadContacts(searchQuery.trim())
    } catch (err) {
      setError(extractApiError(err, 'Failed to load sample contacts.'))
    } finally {
      setSeeding(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Contacts Directory</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Manage recipients queried by the agent&apos;s <code>find_contacts</code> tool.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSeed}
            disabled={seeding}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{seeding ? 'Adding...' : 'Add Sample Contacts'}</span>
          </button>
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-700 dark:text-rose-300"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Contact Form */}
          <section
            aria-labelledby="contact-form-heading"
            className="lg:col-span-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
          >
            <h2 id="contact-form-heading" className="text-base font-semibold mb-4">
              {editingId ? 'Edit Contact' : 'Add Contact'}
            </h2>
            <form onSubmit={handleSaveContact} className="space-y-3">
              <div>
                <label htmlFor="contact-name" className="block text-xs font-medium mb-1">
                  Name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="contact-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mp-input w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="contact-email" className="block text-xs font-medium mb-1">
                  Email <span aria-hidden="true">*</span>
                </label>
                <input
                  id="contact-email"
                  type="email"
                  required
                  spellCheck={false}
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="mp-input w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label htmlFor="contact-company" className="block text-xs font-medium mb-1">
                    Company
                  </label>
                  <input
                    id="contact-company"
                    type="text"
                    value={form.company}
                    onChange={(e) => setForm({ ...form, company: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="contact-role" className="block text-xs font-medium mb-1">
                    Role
                  </label>
                  <input
                    id="contact-role"
                    type="text"
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-relationship" className="block text-xs font-medium mb-1">
                  Member Type (Emoji Tone)
                </label>
                <select
                  id="contact-relationship"
                  value={form.relationshipType}
                  onChange={(e) => setForm({ ...form, relationshipType: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                >
                  <option value="official">Official (Formal / Work)</option>
                  <option value="unofficial">Unofficial (Friend / Casual — Extra Emojis ✨😊)</option>
                </select>
              </div>

              <div>
                <label htmlFor="contact-tags" className="block text-xs font-medium mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  id="contact-tags"
                  type="text"
                  placeholder="design, product"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="contact-notes" className="block text-xs font-medium mb-1">
                  Notes
                </label>
                <textarea
                  id="contact-notes"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{saving ? 'Saving...' : editingId ? 'Update Contact' : 'Save Contact'}</span>
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId('')
                      setForm(EMPTY_FORM)
                    }}
                    className="px-3 py-2 rounded-lg text-xs font-medium border border-slate-300 dark:border-slate-700"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Contacts List */}
          <section className="lg:col-span-8 space-y-4">
            <search>
              <form onSubmit={handleSearchSubmit} className="flex gap-2">
                <div className="relative flex-1">
                  <label htmlFor="contact-search" className="visually-hidden">
                    Search contacts
                  </label>
                  <Search
                    className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    id="contact-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search contacts by name, email, role, or tag..."
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3.5 py-2 text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                >
                  Search
                </button>
              </form>
            </search>

            {loading ? (
              <p className="text-sm text-slate-500 py-6">Loading contacts...</p>
            ) : contacts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
                No contacts found. Add contacts on the left or click &ldquo;Add Sample Contacts&rdquo;.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {contacts.map((c) => (
                  <article
                    key={c._id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-sm">{c.name}</h3>
                          <span
                            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              c.relationshipType === 'unofficial'
                                ? 'bg-pink-500/15 text-pink-700 dark:text-pink-300'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {c.relationshipType === 'unofficial' ? 'Unofficial ✨' : 'Official'}
                          </span>
                        </div>
                        <p className="text-xs text-blue-600 dark:text-blue-400 break-all">
                          {c.email}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEdit(c)}
                          aria-label={`Edit ${c.name}`}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c._id)}
                          aria-label={`Delete ${c.name}`}
                          className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-500/10"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </div>

                    {(c.role || c.company) && (
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {[c.role, c.company].filter(Boolean).join(' · ')}
                      </p>
                    )}

                    {c.notes && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{c.notes}</p>
                    )}

                    {c.tags?.length > 0 && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {c.tags.map((tag) => (
                          <span
                            key={tag}
                            className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  )
}
