import { useEffect, useState } from 'react'
import { collection, getDocs, doc, setDoc } from 'firebase/firestore'
import { db } from '../../config/firebase'
import './Admin.css'

interface SystemConfig {
  defaultCategories: string[]
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
  const [newCategory, setNewCategory] = useState('')
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  async function loadConfig() {
    try {
      const configDoc = await getDocs(collection(db, 'systemConfig'))
      if (!configDoc.empty) {
        const data = configDoc.docs[0].data() as SystemConfig
        setConfig(data)
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
    if (newCategory.trim()) {
      setConfig({
        ...config,
        defaultCategories: [...config.defaultCategories, newCategory.trim()],
      })
      setNewCategory('')
    }
  }

  function startEdit(index: number, currentVal: string) {
    setEditingIndex(index)
    setEditValue(currentVal)
  }

  function saveEdit(index: number) {
    if (editValue.trim()) {
      const newCategories = [...config.defaultCategories]
      newCategories[index] = editValue.trim()
      setConfig({
        ...config,
        defaultCategories: newCategories
      })
    }
    setEditingIndex(null)
    setEditValue('')
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
            These categories will be suggested when new users create their first budget.
          </p>

          <div className="categories-manager">
            <form onSubmit={addDefaultCategory} className="add-category-form">
              <input
                type="text"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                placeholder="New category name..."
                className="form-input"
              />
              <button type="submit" className="btn-primary" disabled={!newCategory.trim()}>
                Add
              </button>
            </form>

            <div className="categories-list-config">
              {config.defaultCategories.map((cat, index) => (
                <div key={index} className="category-item-config">
                  {editingIndex === index ? (
                    <div className="edit-mode">
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        autoFocus
                        className="edit-input"
                      />
                      <div className="edit-actions">
                        <button onClick={() => saveEdit(index)} className="btn-icon check" aria-label="Save">✓</button>
                        <button onClick={() => setEditingIndex(null)} className="btn-icon cancel" aria-label="Cancel">✕</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="category-name">{cat}</span>
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

