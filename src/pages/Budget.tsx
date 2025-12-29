import { useEffect, useState } from 'react'
import { collection, query, where, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './Budget.css'

interface CategoryGroup {
  id: string
  name: string
  isIncome: boolean
  sortOrder: number
}

export interface BudgetCategory {
  id?: string
  name: string
  amount: number
  userId: string
  type: string // Maps to CategoryGroup.id
  isSystemDefault?: boolean
}

interface DefaultCategory {
  name: string
  type: string
}

export default function Budget() {
  const { currentUser } = useAuth()
  const [userCategories, setUserCategories] = useState<BudgetCategory[]>([])
  const [mergedCategories, setMergedCategories] = useState<BudgetCategory[]>([])
  const [groupings, setGroupings] = useState<CategoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Custom category form
  const [customName, setCustomName] = useState('')
  const [customType, setCustomType] = useState('monthly')
  const [customAmount, setCustomAmount] = useState('')

  useEffect(() => {
    if (!currentUser) return

    setLoading(true)

    // 1. Fetch System Defaults & Groupings
    const fetchDefaults = async () => {
      try {
        const docRef = doc(db, 'systemConfig', 'main')
        const snapshot = await getDoc(docRef)

        let defaults: DefaultCategory[] = []
        let loadedGroupings: CategoryGroup[] = []

        if (snapshot.exists()) {
          const data = snapshot.data()
          if (Array.isArray(data.defaultCategories)) {
            defaults = data.defaultCategories.map((cat: any) => {
              if (typeof cat === 'string') return { name: cat, type: 'monthly' }
              return cat
            })
          }

          if (Array.isArray(data.groupings) && data.groupings.length > 0) {
            loadedGroupings = data.groupings
          } else {
            // Fallback for migration/first load
            loadedGroupings = [
              { id: 'income', name: 'Income', isIncome: true, sortOrder: 0 },
              { id: 'monthly', name: 'Monthly Expense', isIncome: false, sortOrder: 1 },
              { id: 'adhoc', name: 'Ad Hoc Expense', isIncome: false, sortOrder: 2 }
            ]
          }
        } else {
          // Fallback if no config
          loadedGroupings = [
            { id: 'income', name: 'Income', isIncome: true, sortOrder: 0 },
            { id: 'monthly', name: 'Monthly Expense', isIncome: false, sortOrder: 1 },
            { id: 'adhoc', name: 'Ad Hoc Expense', isIncome: false, sortOrder: 2 }
          ]
        }
        return { defaults, loadedGroupings }
      } catch (err) {
        console.error("Error loading defaults", err)
        return { defaults: [], loadedGroupings: [] }
      }
    }

    // 2. Listen to User Budgets
    const q = query(
      collection(db, 'budgets'),
      where('userId', '==', currentUser.uid)
    )

    // Initial fetch of defaults then setup listener
    fetchDefaults().then(({ defaults, loadedGroupings }) => {
      // Sort groupings immediately
      loadedGroupings.sort((a, b) => a.sortOrder - b.sortOrder)
      setGroupings(loadedGroupings)

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userCats: BudgetCategory[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
          userCats.push({
            id: doc.id,
            name: data.name || 'Unnamed',
            amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
            userId: data.userId,
            type: data.type || 'monthly'
          })
        })

        setUserCategories(userCats)
        mergeAndSetCategories(userCats, defaults, loadedGroupings) // Pass latest groupings
        setLoading(false)
      })

      return () => unsubscribe()
    })

  }, [currentUser])

  function mergeAndSetCategories(userCats: BudgetCategory[], defaults: DefaultCategory[], currentGroupings: CategoryGroup[]) {
    // 1. Map user categories by normalized name for easy lookup
    const userMap = new Map<string, BudgetCategory>()
    userCats.forEach(c => userMap.set(c.name.trim().toLowerCase(), c))

    const combined: BudgetCategory[] = []
    const processedNames = new Set<string>()

    // 2. Add System Defaults first
    defaults.forEach(def => {
      const normName = def.name.trim().toLowerCase()
      processedNames.add(normName)

      if (userMap.has(normName)) {
        combined.push(userMap.get(normName)!)
      } else {
        combined.push({
          name: def.name,
          amount: 0,
          userId: currentUser!.uid,
          type: def.type,
          isSystemDefault: true
        })
      }
    })

    // 3. Add any Custom User Categories
    userCats.forEach(c => {
      const normName = c.name.trim().toLowerCase()
      if (!processedNames.has(normName)) {
        combined.push(c)
      }
    })

    // Sort: By Group Order, then Alphabetical
    // Create map for group sort order
    const groupOrder = new Map<string, number>()
    currentGroupings.forEach(g => groupOrder.set(g.id, g.sortOrder))

    combined.sort((a, b) => {
      const orderA = groupOrder.get(a.type) ?? 999
      const orderB = groupOrder.get(b.type) ?? 999
      const typeDiff = orderA - orderB

      if (typeDiff !== 0) return typeDiff
      return a.name.localeCompare(b.name)
    })

    setMergedCategories(combined)
  }

  async function handleSaveAmount(category: BudgetCategory, newAmount: number) {
    if (!currentUser) return

    try {
      if (category.id) {
        // Update existing
        if (newAmount === category.amount) return // No change
        await updateDoc(doc(db, 'budgets', category.id), {
          amount: newAmount
        })
      } else {
        // Create new from default
        if (newAmount > 0) {
          await addDoc(collection(db, 'budgets'), {
            name: category.name,
            amount: newAmount,
            userId: currentUser.uid,
            createdAt: new Date(),
            type: category.type
          })
        }
      }
    } catch (error) {
      console.error('Error saving budget:', error)
      alert('Failed to save budget amount')
    }
  }

  async function handleCreateCustom(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUser) return

    try {
      const amt = parseFloat(customAmount) || 0
      await addDoc(collection(db, 'budgets'), {
        name: customName,
        amount: amt,
        userId: currentUser.uid,
        createdAt: new Date(),
        type: customType
      })
      setCustomName('')
      setCustomAmount('')
      setCustomType('monthly')
      setShowForm(false)
    } catch (e) {
      console.error("Error creating custom category", e)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this category?")) return
    try {
      await deleteDoc(doc(db, 'budgets', id))
    } catch (e) {
      console.error("Error deleting", e)
    }
  }

  // Helper to render currency input
  const CurrencyInput = ({ category }: { category: BudgetCategory }) => {
    const [val, setVal] = useState(category.amount.toString())

    // Sync internal state if props change (e.g. from DB update)
    useEffect(() => {
      setVal(category.amount.toString())
    }, [category.amount])

    const onBlur = () => {
      const num = parseFloat(val)
      if (!isNaN(num)) {
        handleSaveAmount(category, num)
      } else {
        setVal(category.amount.toString()) // reset if invalid
      }
    }

    return (
      <div className="budget-input-wrapper">
        <span className="currency-symbol">R</span>
        <input
          type="number"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={onBlur}
          className="budget-amount-input"
          placeholder="0.00"
        />
      </div>
    )
  }

  const getGroupingInfo = (typeId: string) => {
    return groupings.find(g => g.id === typeId)
  }

  const getTypeLabel = (type: string) => {
    const g = getGroupingInfo(type)
    return g ? g.name : 'Other'
  }

  const getBadgeClass = (type: string) => {
    const g = getGroupingInfo(type)
    if (g?.isIncome) return 'badge-success'
    // Maybe rotate colors for other groups? For now default
    return 'badge-secondary'
  }

  const totalBudget = userCategories
    .filter(c => {
      const g = groupings.find(grp => grp.id === c.type)
      return g ? !g.isIncome : true
    }) // Sum expenses (non-income)
    .reduce((sum, cat) => sum + cat.amount, 0)

  const totalIncome = userCategories
    .filter(c => {
      const g = groupings.find(grp => grp.id === c.type)
      return g ? g.isIncome : false
    })
    .reduce((sum, cat) => sum + cat.amount, 0)

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading budget...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="budget-header">
        <h1>Budget Management</h1>
        <p>Set your monthly expected amounts for each category.</p>
      </div>

      <div className="budget-summary">
        <div className="summary-item">
          <span className="summary-label">Total Income</span>
          <span className="summary-value" style={{ color: 'var(--color-success)' }}>R {totalIncome.toFixed(2)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Total Expenses</span>
          <span className="summary-value" style={{ color: 'var(--color-danger)' }}>R {totalBudget.toFixed(2)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Net</span>
          <span className="summary-value">R {(totalIncome - totalBudget).toFixed(2)}</span>
        </div>
      </div>

      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Custom Category'}
        </button>
      </div>

      {showForm && (
        <div className="budget-form-card">
          <h3>Add Custom Category</h3>
          <form onSubmit={handleCreateCustom}>
            <div className="form-group">
              <label>Name</label>
              <input type="text" className="form-input" required value={customName} onChange={e => setCustomName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>Type</label>
              <select className="form-select" value={customType} onChange={e => setCustomType(e.target.value)}>
                {groupings.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Amount (R)</label>
              <input type="number" step="0.01" className="form-input" value={customAmount} onChange={e => setCustomAmount(e.target.value)} />
            </div>
            <button className="btn-primary" type="submit">Create</button>
          </form>
        </div>
      )}

      <div className="budget-table-container">
        <table className="budget-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Type</th>
              <th>Monthly Amounts (R)</th>
              <th style={{ width: '50px' }}></th>
            </tr>
          </thead>
          <tbody>
            {mergedCategories.map((cat, idx) => (
              <tr key={cat.id || `def - ${idx} `}>
                <td>{cat.name}</td>
                <td>
                  <span className={`badge ${getBadgeClass(cat.type)} `}>
                    {getTypeLabel(cat.type)}
                  </span>
                </td>
                <td>
                  <CurrencyInput category={cat} />
                </td>
                <td>
                  {cat.id && (
                    <button className="btn-icon delete-icon" onClick={() => handleDelete(cat.id!)} title="Delete">
                      🗑️
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {mergedCategories.length === 0 && (
              <tr><td colSpan={4} style={{ textAlign: 'center', padding: '2rem' }}>No categories found. Add one or configure system defaults.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
