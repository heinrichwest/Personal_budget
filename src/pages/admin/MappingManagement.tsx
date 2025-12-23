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

  useEffect(() => {
    loadMappings()
  }, [])

  async function loadMappings() {
    try {
      const q = query(collection(db, 'transactionMappings'), orderBy('updatedAt', 'desc'))
      const snapshot = await getDocs(q)
      const mappingsList: TransactionMapping[] = []

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data()
        
        // Get user email
        let userEmail = ''
        try {
          const userDoc = await getDoc(doc(db, 'users', data.userId))
          if (userDoc.exists()) {
            userEmail = userDoc.data().email
          }
        } catch (e) {
          // User might not exist
        }

        // Get category name if exists
        let categoryName = ''
        if (data.categoryId) {
          try {
            const catDoc = await getDoc(doc(db, 'budgets', data.categoryId))
            if (catDoc.exists()) {
              categoryName = catDoc.data().name
            }
          } catch (e) {
            // Category might not exist
          }
        }

        mappingsList.push({
          id: docSnap.id,
          ...data,
          userEmail,
          categoryName,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt),
        } as TransactionMapping)
      }

      setMappings(mappingsList)
    } catch (error) {
      console.error('Error loading mappings:', error)
    } finally {
      setLoading(false)
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
                <tr key={mapping.id}>
                  <td>
                    <div className="description-cell">
                      <span className="original-desc">{mapping.originalDescription}</span>
                    </div>
                  </td>
                  <td>
                    <span className="mapped-desc">{mapping.mappedDescription}</span>
                  </td>
                  <td>
                    {mapping.categoryName ? (
                      <span className="category-badge">{mapping.categoryName}</span>
                    ) : (
                      <span className="unmapped">-</span>
                    )}
                  </td>
                  <td>{mapping.userEmail || mapping.userId}</td>
                  <td>{mapping.updatedAt.toLocaleDateString()}</td>
                  <td>
                    <button
                      onClick={() => deleteMapping(mapping.id)}
                      className="btn-secondary btn-sm"
                    >
                      Delete
                    </button>
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

