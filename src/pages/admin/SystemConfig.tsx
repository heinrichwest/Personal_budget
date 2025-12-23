import { useEffect, useState } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import './Admin.css'

type BudgetType = 'income' | 'monthly' | 'adhoc'

interface DefaultCategory {
  name: string
  type: BudgetType
}

interface SystemConfig {
  defaultCategories: DefaultCategory[]
  currency: string
  fiscalYearStart: string
}

export default function SystemConfig() {
  const [config, setConfig] = useState<SystemConfig>({
    defaultCategories: [],
    currency: 'ZAR',
    fiscalYearStart: '01-01',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // New category inputs
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState<BudgetType>('monthly')

  // Edit inputs
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState<BudgetType>('monthly')

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const configDoc = await getDocs(collection(db, 'systemConfig'))
      if (!configDoc.empty) {
        const data = configDoc.docs[0].data()

        // Migration: Check if defaultCategories is string[] or object[]
        let categories: DefaultCategory[] = []
        if (Array.isArray(data.defaultCategories)) {
          if (data.defaultCategories.length > 0 && typeof data.defaultCategories[0] === 'string') {
            // It's the old format [string], convert to object
            categories = (data.defaultCategories as string[]).map(name => ({
              name,
              type: 'monthly' // Default to monthly during migration
            }))
          } else {
            // It's likely the new format
            categories = data.defaultCategories as DefaultCategory[]
          }
        }

        setConfig({
          ...data,
          defaultCategories: categories,
          currency: data.currency || 'ZAR',
          fiscalYearStart: data.fiscalYearStart || '01-01'
        })
      }
    } catch (error) {
      console.error('Error loading config:', error)
    } finally {
      setLoading(false)
    }
  }

  async function saveConfig() {
    setSaving(true)
    try {
      await setDoc(doc(db, 'systemConfig', 'main'), config, { merge: true })
      alert('Configuration saved successfully')
    } catch (error) {
      console.error('Error saving config:', error)
      alert('Failed to save configuration')
    } finally {
      setSaving(false)
    }
  }

  function addDefaultCategory(e: React.FormEvent) {
    e.preventDefault()
    if (newCategoryName.trim()) {
      setConfig({
        ...config,
        defaultCategories: [
          ...config.defaultCategories,
          { name: newCategoryName.trim(), type: newCategoryType }
        ],
      })
      setNewCategoryName('')
      setNewCategoryType('monthly')
    }
  }

  function startEdit(index: number, cat: DefaultCategory) {
    setEditingIndex(index)
    setEditName(cat.name)
    setEditType(cat.type)
  }

  function saveEdit(index: number) {
    if (editName.trim()) {
      const newCategories = [...config.defaultCategories]
      newCategories[index] = { name: editName.trim(), type: editType }
      setConfig({
        ...config,
        defaultCategories: newCategories
      })
    }
    setEditingIndex(null)
    setEditName('')
  }

  function removeCategory(index: number) {
    if (window.confirm('Are you sure you want to remove this category?')) {
      setConfig({
        ...config,
        defaultCategories: config.defaultCategories.filter((_, i) => i !== index),
      })
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading configuration...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="admin-header">
        <h1>System Configuration</h1>
        <p>Configure system-wide settings and defaults</p>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <h2>Default Budget Categories</h2>
          <p className="config-hint">
            These categories and types will be suggested when new users create their first budget.
          </p>

          <div className="categories-manager">
            <form onSubmit={addDefaultCategory} className="add-category-form">
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="New category name..."
                className="form-input"
                style={{ flex: 2 }}
              />
              <select
                value={newCategoryType}
                onChange={(e) => setNewCategoryType(e.target.value as BudgetType)}
                className="form-select"
                style={{ flex: 1 }}
              >
                <option value="income">Income</option>
                <option value="monthly">Monthly</option>
                <option value="adhoc">Ad Hoc</option>
              </select>
              <button type="submit" className="btn-primary" disabled={!newCategoryName.trim()}>
                Add
              </button>
            </form>

            <div className="categories-list-config">
              {config.defaultCategories.map((cat, index) => (
                <div key={index} className="category-item-config">
                  {editingIndex === index ? (
                    <div className="edit-mode" style={{ width: '100%' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        autoFocus
                        className="edit-input"
                        style={{ flex: 2 }}
                      />
                      <select
                        value={editType}
                        onChange={(e) => setEditType(e.target.value as BudgetType)}
                        className="edit-select"
                        style={{ flex: 1, padding: '0.25rem' }}
                      >
                        <option value="income">Income</option>
                        <option value="monthly">Monthly</option>
                        <option value="adhoc">Ad Hoc</option>
                      </select>
                      <div className="edit-actions">
                        <button onClick={() => saveEdit(index)} className="btn-icon check" aria-label="Save">✓</button>
                        <button onClick={() => setEditingIndex(null)} className="btn-icon cancel" aria-label="Cancel">✕</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                        <span className="category-name">{cat.name}</span>
                        <span className={`badge ${cat.type === 'income' ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.7rem' }}>
                          {cat.type}
                        </span>
                      </div>
                      <div className="item-actions">
                        <button
                          onClick={() => startEdit(index, cat)}
                          className="btn-text"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => removeCategory(index)}
                          className="btn-text delete"
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {config.defaultCategories.length === 0 && (
                <div className="empty-state-small">No default categories defined.</div>
              )}
            </div>
          </div>
        </div>

        <div className="config-card">
          <h2>System Settings</h2>
          <div className="form-group">
            <label htmlFor="currency">Currency</label>
            <select
              id="currency"
              value={config.currency}
              onChange={(e) => setConfig({ ...config, currency: e.target.value })}
              className="form-select"
            >
              <option value="ZAR">ZAR (South African Rand)</option>
              <option value="USD">USD (US Dollar)</option>
              <option value="EUR">EUR (Euro)</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="fiscalYearStart">Fiscal Year Start</label>
            <input
              id="fiscalYearStart"
              type="text"
              value={config.fiscalYearStart}
              onChange={(e) => setConfig({ ...config, fiscalYearStart: e.target.value })}
              placeholder="MM-DD (e.g., 01-01)"
              className="form-input"
            />
            <p className="field-hint">Format: MM-DD (e.g. 03-01 for 1st March)</p>
          </div>
        </div>
      </div>

      <div className="config-actions-footer">
        <button onClick={saveConfig} className="btn-primary" disabled={saving}>
          {saving ? 'Saving...' : 'Save All Changes'}
        </button>
      </div>
    </div>
  )
}

