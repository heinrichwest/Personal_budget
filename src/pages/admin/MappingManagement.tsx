import { useEffect, useState } from 'react'
import { useAuth } from '../../contexts/AuthContext'
import { collection, getDocs, getDoc, updateDoc, deleteDoc, addDoc, doc, query, orderBy, where, writeBatch } from 'firebase/firestore'
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
  const { currentUser, isAdmin } = useAuth()
  const [mappings, setMappings] = useState<TransactionMapping[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editMapDesc, setEditMapDesc] = useState('')
  const [editCatId, setEditCatId] = useState('')
  const [allCategories, setAllCategories] = useState<Array<{ id: string, name: string, userId: string }>>([])
  const [systemDefaults, setSystemDefaults] = useState<string[]>([])
  const [sortConfig, setSortConfig] = useState<{ field: keyof TransactionMapping, direction: 'asc' | 'desc' } | null>(null)
  const [systemRulesSet, setSystemRulesSet] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')

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
    if (!currentUser) return // Auth check

    try {
      let rawMappings: any[] = []

      if (isAdmin) {
        // Admin: Load ALL
        const q = query(collection(db, 'transactionMappings'), orderBy('updatedAt', 'desc'))
        const snapshot = await getDocs(q)
        rawMappings = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      } else {
        // User: Load System (no userId or userId='SYSTEM') AND Personal (userId=uid)
        const systemQ = query(
          collection(db, 'transactionMappings'),
          where('userId', 'in', ['SYSTEM', null])
        )
        const personalQ = query(
          collection(db, 'transactionMappings'),
          where('userId', '==', currentUser.uid)
        )

        const [sysSnap, persSnap] = await Promise.all([getDocs(systemQ), getDocs(personalQ)])

        const sysDocs = sysSnap.docs.map(d => ({ id: d.id, ...d.data(), isSystem: true }))
        const persDocs = persSnap.docs.map(d => ({ id: d.id, ...d.data(), isSystem: false }))

        // Track system rules to know if "Revert" is possible. Strict typing for safety.
        // The inferred type of sysDocs items should have `originalDescription`.
        const sysDesc = new Set(sysDocs.map((d: any) => (d.originalDescription || '').toLowerCase().trim()))
        setSystemRulesSet(sysDesc)

        rawMappings = [...persDocs, ...sysDocs]
      }

      const userIds = new Set<string>()
      const categoryIds = new Set<string>()

      rawMappings.forEach(data => {
        if (data.userId && data.userId !== 'SYSTEM') userIds.add(data.userId)
        if (data.categoryId) categoryIds.add(data.categoryId)
      })

      // Fetch metadata (Users/Categories)
      const userMap = new Map<string, string>()
      if (isAdmin && userIds.size > 0) {
        const userPromises = Array.from(userIds).map(id => getDoc(doc(db, 'users', id)))
        const userSnaps = await Promise.all(userPromises)
        userSnaps.forEach(snap => {
          if (snap.exists()) userMap.set(snap.id, snap.data().email)
        })
      }

      const categoryPromises = Array.from(categoryIds).map(id => getDoc(doc(db, 'budgets', id)))
      const categorySnaps = await Promise.all(categoryPromises)

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
          userId: data.userId || 'SYSTEM',
          userEmail: (!data.userId || data.userId === 'SYSTEM') ? 'System Generic' : (userMap.get(data.userId) || 'Unknown'),
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate() : new Date(data.createdAt || Date.now()),
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt || Date.now()),
        }
      })

      // Filter Overrides for User View
      if (!isAdmin) {
        const personalDescriptions = new Set(mappingsList.filter(m => m.userId !== 'SYSTEM').map(m => m.originalDescription.toLowerCase().trim()))
        const filteredList = mappingsList.filter(m => {
          if (m.userId === 'SYSTEM') {
            // Hide if overridden
            return !personalDescriptions.has(m.originalDescription.toLowerCase().trim())
          }
          return true
        })
        setMappings(filteredList)
      } else {
        setMappings(mappingsList)
      }

    } catch (error) {
      console.error('Error loading mappings:', error)
    } finally {
      setLoading(false)
    }
  }

  function startEdit(mapping: TransactionMapping) {
    setEditingId(mapping.id)
    setEditMapDesc(toTitleCase(mapping.mappedDescription))

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

  // --- HISTORICAL UPDATE HELPER ---
  async function reapplyRuleToHistory(originalDesc: string, targetUserId: string) {
    try {
      // Find the "Winner" Rule for this description (System or Personal)
      const q = query(collection(db, 'transactionMappings'), where('originalDescription', '==', originalDesc))
      const snap = await getDocs(q)
      let candidates = snap.docs.map(d => d.data() as TransactionMapping)

      // 1. Filter relevant rules (Target User OR System)
      candidates = candidates.filter(c => c.userId === targetUserId || c.userId === 'SYSTEM' || !c.userId)

      // 2. Sort to find winner: Personal > System(WithCategory) > System(NoCategory)
      candidates.sort((a, b) => {
        // Personal Priority
        const aIsPersonal = a.userId === targetUserId
        const bIsPersonal = b.userId === targetUserId
        if (aIsPersonal && !bIsPersonal) return -1
        if (bIsPersonal && !aIsPersonal) return 1

        // Secondary: Prefer rules that define a Category (ID or Name)
        const aHasCat = !!(a.categoryId || a.categoryName)
        const bHasCat = !!(b.categoryId || b.categoryName)
        if (aHasCat && !bHasCat) return -1
        if (bHasCat && !aHasCat) return 1

        return 0
      })

      const winner = candidates.length > 0 ? candidates[0] : undefined

      const batch = writeBatch(db)
      let batchCount = 0

      // Get transactions to update
      const transQ = query(
        collection(db, 'transactions'),
        where('userId', '==', targetUserId)
      )

      const transSnap = await getDocs(transQ)
      const targetDescClean = originalDesc.trim().toLowerCase()

      const validUserCategories = allCategories.filter(c => c.userId === targetUserId || c.userId === 'SYSTEM')

      transSnap.docs.forEach(docSnap => {
        const t = docSnap.data()
        const tDesc = (t.originalDescription || t.description || '').trim().toLowerCase()

        // Match using includes (partial match) - same logic as Transactions.tsx line 620
        if (tDesc === targetDescClean || tDesc.includes(targetDescClean)) {
          if (winner) {
            let finalCatId = winner.categoryId
            let finalCatName = winner.categoryName

            // GLOBAL RESOLUTION:
            // Prefer resolving Category Name to the User's specific Budget ID.
            if (winner.categoryName && validUserCategories.length > 0) {
              const match = validUserCategories.find(c => c.name.trim().toLowerCase() === winner.categoryName!.trim().toLowerCase())
              if (match) {
                finalCatId = match.id
                finalCatName = match.name
              }
            }

            batch.update(docSnap.ref, {
              mappedDescription: winner.mappedDescription,
              categoryId: finalCatId || null,
              categoryName: finalCatName || null
            })
          } else {
            // Revert to original if no rule exists
            batch.update(docSnap.ref, {
              mappedDescription: t.originalDescription || t.description,
              categoryId: null,
              categoryName: null
            })
          }
          batchCount++
        }
      })

      if (batchCount > 0) {
        await batch.commit()
      }
    } catch (e) {
      console.error("Error reapplying history", e)
    }
  }

  async function saveEdit(id: string) {
    if (!currentUser) return

    try {
      const mappingToUpdate = mappings.find(m => m.id === id)
      if (!mappingToUpdate) return

      const now = new Date()

      // Resolve category - handle NEW: prefix by creating the budget first
      let finalCategoryId: string | null = editCatId || null
      let finalCategoryName: string | undefined = undefined

      if (editCatId) {
        if (editCatId.startsWith('NEW:')) {
          // Create a new budget for this category
          const newName = editCatId.substring(4)
          const docRef = await addDoc(collection(db, 'budgets'), {
            name: newName,
            amount: 0,
            userId: currentUser.uid,
            createdAt: now
          })
          finalCategoryId = docRef.id
          finalCategoryName = newName
        } else {
          // Find existing category
          const cat = allCategories.find(c => c.id === editCatId)
          if (cat) {
            finalCategoryName = cat.name
          }
        }
      }

      let shouldUpdateHistory = false
      let historyOwnerId = currentUser.uid

      if (mappingToUpdate.userId === 'SYSTEM' && !isAdmin) {
        // Check if personal override already exists for this description
        const existingOverrideQuery = query(
          collection(db, 'transactionMappings'),
          where('originalDescription', '==', mappingToUpdate.originalDescription),
          where('userId', '==', currentUser.uid)
        )
        const existingOverrideSnap = await getDocs(existingOverrideQuery)

        if (!existingOverrideSnap.empty) {
          // Update existing personal override
          const existingRef = existingOverrideSnap.docs[0].ref
          await updateDoc(existingRef, {
            mappedDescription: editMapDesc,
            categoryId: finalCategoryId,
            categoryName: finalCategoryName,
            updatedAt: now
          })
        } else {
          // Create new Personal Override
          await addDoc(collection(db, 'transactionMappings'), {
            originalDescription: mappingToUpdate.originalDescription,
            mappedDescription: editMapDesc,
            categoryId: finalCategoryId,
            categoryName: finalCategoryName,
            userId: currentUser.uid,
            createdAt: now,
            updatedAt: now
          })
        }

        shouldUpdateHistory = true
        historyOwnerId = currentUser.uid

        alert("Personal override saved! Updating your historical transactions...")

      } else {
        // Update Existing
        const ref = doc(db, 'transactionMappings', id)

        await updateDoc(ref, {
          mappedDescription: editMapDesc,
          categoryId: finalCategoryId,
          categoryName: finalCategoryName || null,
          updatedAt: now
        })

        if (mappingToUpdate.userId !== 'SYSTEM') {
          shouldUpdateHistory = true
          historyOwnerId = mappingToUpdate.userId
        }
      }

      // Re-apply history
      if (shouldUpdateHistory) {
        await reapplyRuleToHistory(mappingToUpdate.originalDescription, historyOwnerId)
      }

      // Reload
      await loadMappings()
      setEditingId(null)

    } catch (e) {
      console.error("Error updating mapping", e)
      alert("Failed to update mapping")
    }
  }

  async function deleteMapping(id: string) {
    if (!confirm('Are you sure you want to delete this mapping?')) return

    try {
      const mappingToDelete = mappings.find(m => m.id === id)
      if (!mappingToDelete) return

      await deleteDoc(doc(db, 'transactionMappings', id))

      // Update history
      if (currentUser) {
        await reapplyRuleToHistory(mappingToDelete.originalDescription, currentUser.uid)
      }

      await loadMappings()
    } catch (error) {
      console.error('Error deleting mapping:', error)
      alert('Failed to delete mapping')
    }
  }

  async function ignoreMapping(mapping: TransactionMapping) {
    if (!currentUser) return

    try {
      const now = new Date()
      const targetDesc = mapping.originalDescription

      // If It's System Rule -> Create Override with NULL category
      if (mapping.userId === 'SYSTEM' && !isAdmin) {
        await addDoc(collection(db, 'transactionMappings'), {
          originalDescription: targetDesc,
          mappedDescription: targetDesc, // Map to itself
          categoryId: null,
          categoryName: null,
          userId: currentUser.uid,
          createdAt: now,
          updatedAt: now
        })
      } else {
        // If It's Personal Rule -> Update to NULL category
        const ref = doc(db, 'transactionMappings', mapping.id)
        await updateDoc(ref, {
          mappedDescription: targetDesc,
          categoryId: null,
          categoryName: null,
          updatedAt: now
        })
      }

      // Re-apply History
      await reapplyRuleToHistory(targetDesc, currentUser.uid)
      await loadMappings()
      alert("Mapping ignored for future transactions.")

    } catch (e) {
      console.error("Error ignoring mapping", e)
      alert("Failed to ignore mapping")
    }
  }

  const filteredMappings = mappings.filter(m => {
    if (filter === 'withCategory' && !m.categoryId) return false
    if (filter === 'withoutCategory' && !!m.categoryId) return false

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

        {isAdmin && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
            <button
              className="btn-primary"
              onClick={async () => {
                const candidates = filteredMappings.filter(m => m.userId !== 'SYSTEM')
                if (candidates.length === 0) {
                  alert('No user mappings found in current view to promote.')
                  return
                }
                if (!confirm(`Promote ${candidates.length} mappings to System Defaults? This will make them global.`)) return

                try {
                  const batch = writeBatch(db)
                  candidates.forEach(m => {
                    const ref = doc(db, 'transactionMappings', m.id)
                    batch.update(ref, { userId: 'SYSTEM' })
                  })
                  await batch.commit()
                  alert("Mappings promoted successfully.")
                  loadMappings()
                } catch (e) {
                  console.error(e)
                  alert("Batch update failed")
                }
              }}
            >
              Promote Visible to System
            </button>
          </div>
        )}
      </div>

      {/* Specific Adoption Banner */}
      {isAdmin && mappings.some(m => m.userEmail === 'hein@speccon.co.za') && (
        <div style={{ backgroundColor: '#e3f2fd', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', border: '1px solid #2196f3', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#0d47a1' }}>Test Data Detected</h3>
            <p style={{ margin: '0.5rem 0 0', color: '#1565c0' }}>
              Found {mappings.filter(m => m.userEmail === 'hein@speccon.co.za').length} mappings from <strong>hein@speccon.co.za</strong>.
              Do you want to use these as the System Defaults?
            </p>
          </div>
          <button
            className="btn-primary"
            style={{ backgroundColor: '#1565c0' }}
            onClick={async () => {
              if (!confirm("Convert all 'hein@speccon.co.za' data to System Defaults?")) return

              const candidates = mappings.filter(m => m.userEmail === 'hein@speccon.co.za')
              const batch = writeBatch(db)

              candidates.forEach(m => {
                const ref = doc(db, 'transactionMappings', m.id)
                batch.update(ref, { userId: 'SYSTEM' })
              })

              try {
                await batch.commit()
                alert("Successfully converted test data to System Defaults!")
                loadMappings()
              } catch (e) {
                console.error(e)
                alert("Conversion failed")
              }
            }}
          >
            Adopt as System Data
          </button>
        </div>
      )}

      <div className="admin-table-container" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
        <table className="admin-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th onClick={() => handleSort('originalDescription')} style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white', cursor: 'pointer', borderBottom: '2px solid #e0e0e0', boxShadow: '0 1px 0 #e0e0e0' }}>
                Original Description {sortConfig?.field === 'originalDescription' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('mappedDescription')} style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white', cursor: 'pointer', borderBottom: '2px solid #e0e0e0', boxShadow: '0 1px 0 #e0e0e0' }}>
                Mapped Description {sortConfig?.field === 'mappedDescription' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('categoryName')} style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white', cursor: 'pointer', borderBottom: '2px solid #e0e0e0', boxShadow: '0 1px 0 #e0e0e0' }}>
                Category {sortConfig?.field === 'categoryName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              {isAdmin && (
                <th onClick={() => handleSort('userEmail')} style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white', cursor: 'pointer', borderBottom: '2px solid #e0e0e0', boxShadow: '0 1px 0 #e0e0e0' }}>
                  User {sortConfig?.field === 'userEmail' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                </th>
              )}
              <th onClick={() => handleSort('updatedAt')} style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white', cursor: 'pointer', borderBottom: '2px solid #e0e0e0', boxShadow: '0 1px 0 #e0e0e0' }}>
                Last Updated {sortConfig?.field === 'updatedAt' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
              </th>
              <th style={{ position: 'sticky', top: 0, zIndex: 1000, backgroundColor: 'white', cursor: 'default', borderBottom: '2px solid #e0e0e0', boxShadow: '0 1px 0 #e0e0e0' }}>Actions</th>
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
                          const rawUserCats = allCategories.filter(cat => cat.userId === mapping.userId || cat.userId === currentUser?.uid)

                          const userCats = Array.from(new Map(rawUserCats.map(item => [item.name.trim(), item])).values())
                          const combined = [...userCats]

                          // Add current default suggestion if not in list
                          if (systemDefaults.length > 0) {
                            const userCatNames = new Set(userCats.map(c => c.name.toLowerCase().trim()))
                            const additionalDefaults = systemDefaults
                              .filter(name => !userCatNames.has(name.toLowerCase().trim()))
                              .map(name => ({
                                id: `NEW:${name}`,
                                name: name,
                                userId: 'SYSTEM'
                              }))
                            combined.push(...additionalDefaults)
                          }

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
                  {isAdmin && (
                    <td>{mapping.userEmail || mapping.userId}</td>
                  )}
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

                        {/* Ignore Button */}
                        {!isAdmin && (mapping.categoryId || mapping.mappedDescription !== mapping.originalDescription) && (
                          <button
                            onClick={() => ignoreMapping(mapping)}
                            className="btn-outline btn-sm"
                            title="Ignore this mapping (remove category)"
                            style={{ color: '#d32f2f', borderColor: '#d32f2f' }}
                          >
                            Ignore
                          </button>
                        )}

                        {isAdmin && mapping.userId !== 'SYSTEM' && (
                          <button
                            onClick={async () => {
                              if (!confirm('Promote this mapping to System Default? It will apply to all users without their own override.')) return
                              try {
                                const ref = doc(db, 'transactionMappings', mapping.id)
                                await updateDoc(ref, { userId: 'SYSTEM' })
                                loadMappings()
                              } catch (e) {
                                console.error(e)
                                alert("Failed to update mapping")
                              }
                            }}
                            className="btn-primary btn-sm"
                            title="Promote to System Default"
                          >
                            To System
                          </button>
                        )}
                        {(isAdmin || mapping.userId !== 'SYSTEM') && (
                          <button
                            onClick={() => deleteMapping(mapping.id)}
                            className="btn-secondary btn-sm"
                            title={
                              !isAdmin && systemRulesSet.has(mapping.originalDescription.toLowerCase().trim())
                                ? "Remove your custom rule and use the System Default"
                                : "Delete this rule permanently"
                            }
                          >
                            {!isAdmin && systemRulesSet.has(mapping.originalDescription.toLowerCase().trim())
                              ? "Revert to System"
                              : "Delete"
                            }
                          </button>
                        )}
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
