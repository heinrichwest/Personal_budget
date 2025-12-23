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

export default function MappingManagement() {
  const [mappings, setMappings] = useState<TransactionMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMapDesc, setEditMapDesc] = useState('')
  const [editCatId, setEditCatId] = useState('')
  const [allCategories, setAllCategories] = useState<Array<{ id: string, name: string, userId: string }>>([])

  useEffect(() => {
    loadMappings()
    loadAllCategories()
  }, [])

  async function loadAllCategories() {
    try {
      const snapshot = await getDocs(collection(db, 'budgets'))
      const cats = snapshot.docs.map(d => ({ id: d.id, name: d.data().name, userId: d.data().userId }))
      cats.sort((a, b) => a.name.localeCompare(b.name))
      setAllCategories(cats)
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

      const mappingsList: TransactionMapping[] = rawMappings.map((data: any) => ({
        id: data.id,
        originalDescription: data.originalDescription,
        mappedDescription: data.mappedDescription,
        categoryId: data.categoryId,
        categoryName: data.categoryId ? categoryMap.get(data.categoryId) : undefined,
        userId: data.userId,
        userEmail: data.userId ? userMap.get(data.userId) : undefined,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
      }))

      setMappings(mappingsList)
    } catch (error) {
      console.error('Error loading mappings:', error)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(mapping: TransactionMapping) {
    setEditingId(mapping.id)
    setEditMapDesc(mapping.mappedDescription)

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

  async function saveEdit(id: string) {
    try {
      const ref = doc(db, 'transactionMappings', id)
      await updateDoc(ref, {
        mappedDescription: editMapDesc,
        categoryId: editCatId || null,
        updatedAt: new Date()
      })

      setEditingId(null)
      loadMappings()
    } catch (e) {
      console.error("Error updating mapping", e)
      alert("Failed to update mapping")
    }
  }

  async function deleteMapping(id: string) {
    if (!confirm('Are you sure you want to delete this mapping?')) return

    try {
      await deleteDoc(doc(db, 'transactionMappings', id))
      loadMappings()
    } catch (error) {
      console.error('Error deleting mapping:', error)
      alert('Failed to delete mapping')
    }
  }

  const filteredMappings = filter === 'all'
    ? mappings
    : mappings.filter(m => filter === 'withCategory' ? !!m.categoryId : !m.categoryId)

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

      <div className="filter-section">
        <label>
          Filter:
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
            <option value="all">All Mappings</option>
            <option value="withCategory">With Category</option>
            <option value="withoutCategory">Without Category</option>
          </select>
        </label>
      </div>

      <div className="admin-table-container">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Original Description</th>
              <th>Mapped Description</th>
              <th>Category</th>
              <th>User</th>
              <th>Last Updated</th>
              <th>Actions</th>
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
                      <span className="mapped-desc">{mapping.mappedDescription}</span>
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
                        {allCategories
                          .filter(cat => cat.userId === mapping.userId)
                          .filter((cat, index, self) =>
                            index === self.findIndex(t => t.name === cat.name)
                          )
                          .map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
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
                      <div style={{ display: 'flex', gap: '5px' }}>
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
    </div>
  )
}

