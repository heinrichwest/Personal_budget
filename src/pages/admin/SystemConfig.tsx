import { useEffect, useState } from 'react'
import { collection, getDocs, doc, setDoc, query, where, writeBatch } from 'firebase/firestore'
import { db } from '../../config/firebase'
import './Admin.css'

interface CategoryGroup {
  id: string
  name: string
  isIncome: boolean
  sortOrder: number
}

interface DefaultCategory {
  name: string
  type: string // Maps to CategoryGroup.id
}

interface SystemConfig {
  defaultCategories: DefaultCategory[]
  groupings: CategoryGroup[]
  currency: string
  fiscalYearStart: string
}

export default function SystemConfig() {
  const [config, setConfig] = useState<SystemConfig>({
    defaultCategories: [],
    groupings: [],
    currency: 'ZAR',
    fiscalYearStart: '01-01',
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // New category inputs
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState('monthly')

  // Edit inputs
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('monthly')

  // Grouping inputs
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupIncome, setNewGroupIncome] = useState(false)
  const [editingGroup, setEditingGroup] = useState<string | null>(null) // Group ID
  const [editGroupName, setEditGroupName] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  // Auto-save effect
  useEffect(() => {
    if (loading) return

    const timer = setTimeout(() => {
      saveConfig()
    }, 800)

    return () => clearTimeout(timer)
  }, [config, loading])

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

        // Initialize Groupings if missing (Migration)
        let groupings = data.groupings as CategoryGroup[] || []
        if (groupings.length === 0) {
          groupings = [
            { id: 'income', name: 'Income', isIncome: true, sortOrder: 0 },
            { id: 'monthly', name: 'Monthly Expenses', isIncome: false, sortOrder: 1 },
            { id: 'adhoc', name: 'Ad Hoc Expenses', isIncome: false, sortOrder: 2 }
          ]
        }

        setConfig({
          ...data,
          defaultCategories: categories,
          groupings: groupings,
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
      // Silent success
    } catch (error) {
      console.error('Error saving config:', error)
      // Only alert on error
      alert('Failed to auto-save configuration. Please check your connection.')
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
      // Keep previous type selection for convenience
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

  // --- Grouping Management ---

  function addGrouping(e: React.FormEvent) {
    e.preventDefault()
    if (!newGroupName.trim()) return

    const id = newGroupName.toLowerCase().replace(/\s+/g, '_') + '_' + Date.now().toString().slice(-4)
    const newGroup: CategoryGroup = {
      id,
      name: newGroupName.trim(),
      isIncome: newGroupIncome,
      sortOrder: config.groupings.length
    }

    setConfig({
      ...config,
      groupings: [...config.groupings, newGroup]
    })
    setNewGroupName('')
    setNewGroupIncome(false)
  }

  function updateGrouping(id: string, name: string) {
    setConfig({
      ...config,
      groupings: config.groupings.map(g => g.id === id ? { ...g, name } : g)
    })
    setEditingGroup(null)
  }

  function moveGrouping(index: number, direction: 'up' | 'down') {
    const newGroupings = [...config.groupings]
    if (direction === 'up' && index > 0) {
      [newGroupings[index], newGroupings[index - 1]] = [newGroupings[index - 1], newGroupings[index]]
    } else if (direction === 'down' && index < newGroupings.length - 1) {
      [newGroupings[index], newGroupings[index + 1]] = [newGroupings[index + 1], newGroupings[index]]
    }

    // Reassign sortOrder based on index
    newGroupings.forEach((g, i) => g.sortOrder = i)

    setConfig({ ...config, groupings: newGroupings })
  }

  function deleteGrouping(id: string) {
    if (['income', 'monthly', 'adhoc'].includes(id)) {
      alert("Cannot delete system default groupings.")
      return
    }
    if (window.confirm("Delete this grouping? Categories using it will need to be reassigned.")) {
      setConfig({
        ...config,
        groupings: config.groupings.filter(g => g.id !== id)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>System Configuration</h1>
            <p>Configure system-wide settings and defaults</p>
          </div>
          <div style={{ paddingTop: '1rem' }}>
            {saving ? (
              <span style={{ color: '#f57c00', fontWeight: 'bold', fontSize: '0.9rem' }}>Saving...</span>
            ) : (
              <span style={{ color: '#4caf50', fontWeight: 'bold', fontSize: '0.9rem' }}>All changes saved</span>
            )}
          </div>
        </div>
      </div>

      <div className="config-grid">
        <div className="config-card">
          <h2>Budget Groupings</h2>
          <p className="config-hint">Define how categories are grouped and sorted in reports.</p>

          <div className="groupings-manager" style={{ marginBottom: '2rem' }}>
            <div className="list-header-row" style={{ display: 'flex', fontWeight: 'bold', padding: '0.5rem', borderBottom: '1px solid #eee' }}>
              <span style={{ flex: 1, paddingLeft: '2rem' }}>Name</span>
              <span style={{ width: '80px' }}>Type</span>
              <span style={{ width: '100px' }}>Actions</span>
            </div>
            <div className="groupings-list">
              {config.groupings
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((group, index) => (
                  <div key={group.id} className="grouping-item" style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0.5rem',
                    borderBottom: '1px solid #f5f5f5',
                    backgroundColor: 'white'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', marginRight: '0.5rem' }}>
                      <button
                        onClick={() => moveGrouping(index, 'up')}
                        disabled={index === 0}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: index === 0 ? '#ccc' : '#666' }}
                      >▲</button>
                      <button
                        onClick={() => moveGrouping(index, 'down')}
                        disabled={index === config.groupings.length - 1}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', padding: 0, color: index === config.groupings.length - 1 ? '#ccc' : '#666' }}
                      >▼</button>
                    </div>

                    <div style={{ flex: 1 }}>
                      {editingGroup === group.id ? (
                        <div style={{ display: 'flex', gap: '5px' }}>
                          <input
                            value={editGroupName}
                            onChange={e => setEditGroupName(e.target.value)}
                            className="form-input"
                            style={{ padding: '4px' }}
                          />
                          <button onClick={() => updateGrouping(group.id, editGroupName)} className="btn-icon check">✓</button>
                          <button onClick={() => setEditingGroup(null)} className="btn-icon cancel">✕</button>
                        </div>
                      ) : (
                        <span style={{ fontWeight: 500 }}>{group.name}</span>
                      )}
                    </div>

                    <div style={{ width: '80px' }}>
                      <span className={`badge ${group.isIncome ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.7rem' }}>
                        {group.isIncome ? 'Income' : 'Expense'}
                      </span>
                    </div>

                    <div style={{ width: '100px', display: 'flex', gap: '5px' }}>
                      <button onClick={() => { setEditingGroup(group.id); setEditGroupName(group.name); }} className="btn-text">Edit</button>
                      {!['income', 'monthly', 'adhoc'].includes(group.id) && (
                        <button onClick={() => deleteGrouping(group.id)} className="btn-text delete">Del</button>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            <form onSubmit={addGrouping} className="add-group-form" style={{ marginTop: '1rem', display: 'flex', gap: '10px', alignItems: 'center', backgroundColor: '#f9f9f9', padding: '1rem', borderRadius: '8px' }}>
              <input
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                placeholder="New Group Name (e.g. Savings)"
                className="form-input"
                style={{ flex: 1 }}
              />
              <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={newGroupIncome}
                  onChange={e => setNewGroupIncome(e.target.checked)}
                />
                Is Income?
              </label>
              <button type="submit" className="btn-secondary" disabled={!newGroupName.trim()}>+ Add Group</button>
            </form>
          </div>
        </div>

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
                onChange={(e) => setNewCategoryType(e.target.value)}
                className="form-select"
                style={{ flex: 1 }}
              >
                {config.groupings.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button type="submit" className="btn-primary" disabled={!newCategoryName.trim()}>
                Add
              </button>
            </form>

            <div className="categories-list-config">
              {config.defaultCategories.map((cat, index) => {
                const group = config.groupings.find(g => g.id === cat.type)
                return (
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
                          onChange={(e) => setEditType(e.target.value)}
                          className="edit-select"
                          style={{ flex: 1, padding: '0.25rem' }}
                        >
                          {config.groupings.map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                          ))}
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
                          {group ? (
                            <span className={`badge ${group.isIncome ? 'badge-success' : 'badge-secondary'}`} style={{ fontSize: '0.7rem' }}>
                              {group.name}
                            </span>
                          ) : (
                            <span className="badge badge-error">Unknown Group</span>
                          )}
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
                )
              })}
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


      <div className="config-card" style={{ marginTop: '2rem', border: '1px solid #ffcc80', backgroundColor: '#fff8e1' }}>
        <h2>Migration Tool</h2>
        <p>Promote a user's local settings to System Defaults. This is useful for bootstrapping the system.</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '1rem' }}>
          <input
            type="text"
            placeholder="User Email (e.g. hein@speccon.co.za)"
            id="migrationEmail"
            defaultValue="hein@speccon.co.za"
            className="form-input"
          />
          <button
            className="btn-primary"
            onClick={async () => {
              const emailInput = (document.getElementById('migrationEmail') as HTMLInputElement).value
              if (!emailInput) return;

              if (!confirm(`Are you sure you want to promote mappings and categories from ${emailInput} to SYSTEM defaults? This affects all users.`)) return;

              setLoading(true)
              try {
                // 1. Find User
                const usersRef = collection(db, 'users')
                const userSnap = await getDocs(query(usersRef, where('email', '==', emailInput.toLowerCase())))

                if (userSnap.empty) {
                  alert("User not found.")
                  setLoading(false)
                  return;
                }

                const sourceUserId = userSnap.docs[0].id

                // 2. Promote Mappings (Update userId -> 'SYSTEM')
                // Note: We'll set it to null or 'SYSTEM'. Admin page uses 'SYSTEM' check.
                // Actually, let's keep it null if schema allows, or 'SYSTEM'.
                // Code uses: data.userId || 'SYSTEM' in Admin, so 'SYSTEM' or null is fine.
                // Let's use 'SYSTEM' explicitly.

                const mappingsQ = query(collection(db, 'transactionMappings'), where('userId', '==', sourceUserId))
                const mappingsSnap = await getDocs(mappingsQ)

                const batch = writeBatch(db)
                let mapCount = 0
                mappingsSnap.forEach(doc => {
                  batch.update(doc.ref, { userId: 'SYSTEM' })
                  mapCount++
                })

                if (mapCount > 0) await batch.commit()

                // 3. Promote Categories (Add to defaultCategories)
                const budgetsQ = query(collection(db, 'budgets'), where('userId', '==', sourceUserId))
                const budgetsSnap = await getDocs(budgetsQ)

                const newCats = [...config.defaultCategories]
                const existingNames = new Set(newCats.map(c => c.name.toLowerCase().trim()))
                let catCount = 0

                budgetsSnap.forEach(doc => {
                  const d = doc.data() as any
                  const name = (d.name || '').trim()
                  if (name && !existingNames.has(name.toLowerCase())) {
                    newCats.push({ name: name, type: d.type || 'monthly' })
                    existingNames.add(name.toLowerCase())
                    catCount++
                  }
                })

                if (catCount > 0) {
                  // Update local config state and let autosave or manual save handle it?
                  // Better to save immediately to be safe
                  await setDoc(doc(db, 'systemConfig', 'main'), {
                    ...config,
                    defaultCategories: newCats
                  }, { merge: true })
                  setConfig(prev => ({ ...prev, defaultCategories: newCats }))
                }

                alert(`Migration Complete!\nPromoted ${mapCount} mappings to System.\nAdded ${catCount} new categories to Defaults.`)

              } catch (e: any) {
                console.error("Migration failed", e)
                alert("Migration failed: " + e.message)
              } finally {
                setLoading(false)
              }
            }}
          >
            Run Migration
          </button>
        </div>
      </div>
    </div>
  )
}

