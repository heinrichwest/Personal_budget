import { useEffect, useState } from 'react'
import { collection, getDocs, getDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore'
import { db } from '../../config/firebase'
import './Admin.css'

interface TransactionMapping {
  id: string
  originalDescription: string
  mappedDescription: string
  categoryId?: string
  categoryName?: string
  userId: string
  userEmail?: string
  createdAt: Date
  updatedAt: Date
}

function toTitleCase(str: string) {
  if (!str) return ''
  return str.replace(
    /\w\S*/g,
    text => text.charAt(0).toUpperCase() + text.substring(1).toLowerCase()
  )
}

export default function MappingManagement() {
  const [mappings, setMappings] = useState<TransactionMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMapDesc, setEditMapDesc] = useState('')
  const [editCatId, setEditCatId] = useState('')
  const [allCategories, setAllCategories] = useState<Array<{ id: string, name: string, userId: string }>>([])
  const [systemDefaults, setSystemDefaults] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{ field: keyof TransactionMapping, direction: 'asc' | 'desc' } | null>(null)

  useEffect(() => {
    loadMappings()
    loadAllCategories()
  }, [])

  async function loadAllCategories() {
    try {
      // 1. Fetch User Budgets
      const snapshot = await getDocs(collection(db, 'budgets'))
      const cats = snapshot.docs.map(d => ({ id: d.id, name: d.data().name, userId: d.data().userId }))
      cats.sort((a, b) => a.name.localeCompare(b.name))
      setAllCategories(cats)

      // 2. Fetch System Defaults
      const sysDoc = await getDoc(doc(db, 'systemConfig', 'main'))
      if (sysDoc.exists()) {
        const data = sysDoc.data()
        if (Array.isArray(data.defaultCategories)) {
          const names = data.defaultCategories.map((c: any) => typeof c === 'string' ? c : c.name)
          setSystemDefaults(names)
        }
      }
    } catch (e) {
      console.error("Error loading categories", e)
    }
  }

  async function loadMappings() {
    try {
      const q = query(collection(db, 'transactionMappings'), orderBy('updatedAt', 'desc'))
      const snapshot = await getDocs(q)

      const userIds = new Set<string>()
      const categoryIds = new Set<string>()

      const rawMappings = snapshot.docs.map(doc => {
        const data = doc.data()
        if (data.userId) userIds.add(data.userId)
        if (data.categoryId) categoryIds.add(data.categoryId)
        return { id: doc.id, ...data }
      })

      const userPromises = Array.from(userIds).map(id => getDoc(doc(db, 'users', id)))
      const categoryPromises = Array.from(categoryIds).map(id => getDoc(doc(db, 'budgets', id)))

      const [userSnaps, categorySnaps] = await Promise.all([
        Promise.all(userPromises),
        Promise.all(categoryPromises)
      ])

      const userMap = new Map<string, string>()
      userSnaps.forEach(snap => {
        if (snap.exists()) {
          userMap.set(snap.id, snap.data().email)
        }
      })

      const categoryMap = new Map<string, string>()
      categorySnaps.forEach(snap => {
        if (snap.exists()) {
          categoryMap.set(snap.id, snap.data().name)
        }
      })

      const mappingsList: TransactionMapping[] = rawMappings.map((data: any) => {
        let catName = undefined
        if (data.categoryId) {
          if (data.categoryId.startsWith('NEW:')) {
            catName = data.categoryId.substring(4)
          } else {
            catName = categoryMap.get(data.categoryId)
          }
        }

        return {
          id: data.id,
          originalDescription: data.originalDescription,
          mappedDescription: data.mappedDescription,
          categoryId: data.categoryId,
          categoryName: catName,
          userId: data.userId,
          userEmail: data.userId ? userMap.get(data.userId) : undefined,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
        }
      })

      setMappings(mappingsList)
    } catch (error) {
      console.error('Error loading mappings:', error)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(mapping: TransactionMapping) {
    setEditingId(mapping.id)
    setEditMapDesc(toTitleCase(mapping.mappedDescription))

    // Normalize category ID to the first match by name to handle duplicates
    if (mapping.categoryId) {
      const userCats = allCategories.filter(c => c.userId === mapping.userId)
      const currentCat = userCats.find(c => c.id === mapping.categoryId)
      if (currentCat) {
        const primaryCat = userCats.find(c => c.name === currentCat.name)
        setEditCatId(primaryCat ? primaryCat.id : mapping.categoryId)
      } else {
        setEditCatId(mapping.categoryId)
      }
    } else {
      setEditCatId('')
    }
  }

  function cancelEdit() {
    setEditingId(null)
    setEditMapDesc('')
    setEditCatId('')
  }

  const handleSort = (field: keyof TransactionMapping) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ field, direction })
  }

  async function saveEdit(id: string) {
    try {
      const ref = doc(db, 'transactionMappings', id)
      const now = new Date()
      await updateDoc(ref, {
        mappedDescription: editMapDesc,
        categoryId: editCatId || null,
        updatedAt: now
      })

      // Update local state to avoid re-fetch jump
      setMappings(prev => prev.map(m => {
        if (m.id === id) {
          // Find new category name
          let newCatName = undefined
          if (editCatId) {
            const cat = allCategories.find(c => c.id === editCatId)
            // Or check if it's a new system default being added
            if (cat) {
              newCatName = cat.name
            } else if (editCatId.startsWith('NEW:')) {
              newCatName = editCatId.substring(4)
            }
          }

          return {
            ...m,
            mappedDescription: editMapDesc,
            categoryId: editCatId,
            categoryName: newCatName,
            updatedAt: now
          }
        }
        return m
      }))

      setEditingId(null)
    } catch (e) {
      console.error("Error updating mapping", e)
      alert("Failed to update mapping")
    }
  }

  async function deleteMapping(id: string) {
    if (!confirm('Are you sure you want to delete this mapping?')) return

    try {
      await deleteDoc(doc(db, 'transactionMappings', id))
      setMappings(prev => prev.filter(m => m.id !== id))
    } catch (error) {
      console.error('Error deleting mapping:', error)
      alert('Failed to delete mapping')
    }
  }

  const [searchTerm, setSearchTerm] = useState('')

  // ... (rest of state)

  // ... (load functions)

  // ... (edit/delete functions)

  const filteredMappings = mappings.filter(m => {
    // 1. Filter Check
    if (filter === 'withCategory' && !m.categoryId) return false
    if (filter === 'withoutCategory' && !!m.categoryId) return false

    // 2. Search Check
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase()
      const matchOriginal = m.originalDescription.toLowerCase().includes(lowerSearch)
      const matchMapped = m.mappedDescription.toLowerCase().includes(lowerSearch)
      const matchCategory = m.categoryName?.toLowerCase().includes(lowerSearch)

      if (!matchOriginal && !matchMapped && !matchCategory) return false
    }

    return true
  })

  if (sortConfig !== null) {
    filteredMappings.sort((a, b) => {
      // Handle potentially undefined values safely
      const valA = a[sortConfig.field]
      const valB = b[sortConfig.field]

      if (valA === undefined && valB === undefined) return 0
      if (valA === undefined) return 1
      if (valB === undefined) return -1

      if (valA < valB) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (valA > valB) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading mappings...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="admin-header">
        <h1>Mapping Management</h1>
        <p>View and manage transaction mappings for all users</p>
      </div>

      <div className="filter-section" style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Filter:
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
            <option value="all">All Mappings</option>
            <option value="withCategory">With Category</option>
            <option value="withoutCategory">Without Category</option>
          </select>
        </label>

        <input
          type="text"
          placeholder="Search mappings..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ padding: '0.6rem', borderRadius: '4px', border: '1px solid #ddd', minWidth: '250px' }}
        />
      </div>

      <div className="admin-table-container" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <table className="admin-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('originalDescription')} style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                Original Description {sortConfig?.field === 'originalDescription' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('mappedDescription')} style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                Mapped Description {sortConfig?.field === 'mappedDescription' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('categoryName')} style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                Category {sortConfig?.field === 'categoryName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('userEmail')} style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                User {sortConfig?.field === 'userEmail' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('updatedAt')} style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                Last Updated {sortConfig?.field === 'updatedAt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: 'white', cursor: 'default', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredMappings.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                  No mappings found
                </td>
              </tr>
            ) : (
              filteredMappings.map((mapping) => (
                <tr key={mapping.id} className={editingId === mapping.id ? 'editing-row' : ''}>
                  <td>
                    <div className="description-cell">
                      <span className="original-desc">{mapping.originalDescription}</span>
                    </div>
                  </td>
                  <td>
                    {editingId === mapping.id ? (
                      <input
                        type="text"
                        value={editMapDesc}
                        onChange={(e) => setEditMapDesc(e.target.value)}
                        className="edit-input"
                      />
                    ) : (
                      <span className="mapped-desc">{toTitleCase(mapping.mappedDescription)}</span>
                    )}
                  </td>
                  <td>
                    {editingId === mapping.id ? (
                      <select
                        value={editCatId}
                        onChange={(e) => setEditCatId(e.target.value)}
                        className="edit-select"
                      >
                        <option value="">No Category</option>
                        {(() => {
                          // 1. User's existing categories (Deduplicated by name)
                          const rawUserCats = allCategories.filter(cat => cat.userId === mapping.userId)
                          const userCats = Array.from(new Map(rawUserCats.map(item => [item.name.trim(), item])).values())
                          // 2. System defaults not already in user's list (by name)
                          const userCatNames = new Set(userCats.map(c => c.name.toLowerCase().trim()))
                          const additionalDefaults = systemDefaults
                            .filter(name => !userCatNames.has(name.toLowerCase().trim()))
                            .map(name => ({
                              id: `NEW:${name}`,
                              name: name,
                              userId: 'SYSTEM'
                            }))

                          // Combine and Sort
                          const combined = [...userCats, ...additionalDefaults]
                          combined.sort((a, b) => a.name.localeCompare(b.name))

                          return combined.map(cat => (
                            <option key={cat.id} value={cat.id}>
                              {cat.name} {cat.userId === 'SYSTEM' ? '(New)' : ''}
                            </option>
                          ))
                        })()}
                      </select>
                    ) : (
                      mapping.categoryName ? (
                        <span className="category-badge">{mapping.categoryName}</span>
                      ) : (
                        <span className="unmapped">-</span>
                      )
                    )}
                  </td>
                  <td>{mapping.userEmail || mapping.userId}</td>
                  <td>{mapping.updatedAt.toLocaleDateString()}</td>
                  <td>
                    {editingId === mapping.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                        <button onClick={() => saveEdit(mapping.id)} className="btn-primary btn-sm">Save</button>
                        <button onClick={cancelEdit} className="btn-outline btn-sm">Cancel</button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '5px' }}>
                        <button
                          onClick={() => startEdit(mapping)}
                          className="btn-outline btn-sm"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteMapping(mapping.id)}
                          className="btn-secondary btn-sm"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div >
  )
}

