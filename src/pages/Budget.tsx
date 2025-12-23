import { useEffect, useState } from 'react'
import { collection, query, where, addDoc, updateDoc, deleteDoc, doc, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './Budget.css'

export type BudgetType = 'income' | 'monthly' | 'adhoc'

export interface BudgetCategory {
  id?: string
  name: string
  amount: number
  userId: string
  type: BudgetType
  isSystemDefault?: boolean // To identify if it's a shadow item from defaults
}

interface DefaultCategory {
  name: string
  type: BudgetType
}

export default function Budget() {
  const { currentUser } = useAuth()
  const [userCategories, setUserCategories] = useState<BudgetCategory[]>([])
  const [mergedCategories, setMergedCategories] = useState<BudgetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Custom category form
  const [customName, setCustomName] = useState('')
  const [customType, setCustomType] = useState<BudgetType>('monthly')
  const [customAmount, setCustomAmount] = useState('')

  useEffect(() => {
    if (!currentUser) return

    setLoading(true)

    // 1. Fetch System Defaults
    const fetchDefaults = async () => {
      try {
        const docRef = doc(db, 'systemConfig', 'main')
        const snapshot = await getDoc(docRef)

        let defaults: DefaultCategory[] = []
        if (snapshot.exists()) {
          const data = snapshot.data()
          if (Array.isArray(data.defaultCategories)) {
            // Handle both old string[] and new object[] format safely
            defaults = data.defaultCategories.map((cat: any) => {
              if (typeof cat === 'string') return { name: cat, type: 'monthly' as BudgetType }
              return cat
            })
          }
        }
        return defaults
      } catch (err) {
        console.error("Error loading defaults", err)
        return []
      }
    }

    // 2. Listen to User Budgets
    const q = query(
      collection(db, 'budgets'),
      where('userId', '==', currentUser.uid)
    )

    // Initial fetch of defaults then setup listener
    fetchDefaults().then(defaults => {

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const userCats: BudgetCategory[] = []
        snapshot.forEach((doc) => {
          const data = doc.data()
          userCats.push({
            id: doc.id,
            name: data.name || 'Unnamed',
            amount: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
            userId: data.userId,
            type: (data.type as BudgetType) || 'monthly'
          })
        })

        setUserCategories(userCats)
        mergeAndSetCategories(userCats, defaults) // Use the fetched defaults here
        setLoading(false)
      })

      return () => unsubscribe()
    })

  }, [currentUser])

  function mergeAndSetCategories(userCats: BudgetCategory[], defaults: DefaultCategory[]) {
    // 1. Map user categories by normalized name for easy lookup
    const userMap = new Map<string, BudgetCategory>()
    userCats.forEach(c => userMap.set(c.name.trim().toLowerCase(), c))

    const combined: BudgetCategory[] = []
    const processedNames = new Set<string>()

    // 2. Add System Defaults first
    // This allows us to show all defaults, even if the user hasn't allocated budget to them yet
    defaults.forEach(def => {
      const normName = def.name.trim().toLowerCase()
      processedNames.add(normName)

      if (userMap.has(normName)) {
        // User has a saved budget for this default category -> use user's version
        combined.push(userMap.get(normName)!)
      } else {
        // User hasn't saved this yet -> show default placeholder
        combined.push({
          name: def.name,
          amount: 0,
          userId: currentUser!.uid,
          type: def.type,
          isSystemDefault: true
        })
      }
    })

    // 3. Add any Custom User Categories (those that didn't match a default)
    userCats.forEach(c => {
      const normName = c.name.trim().toLowerCase()
      if (!processedNames.has(normName)) {
        combined.push(c)
      }
    })

    // Sort: Income first, then Monthly, then AdHoc. Inside each, alphabetical.
    const typeOrder = { 'income': 0, 'monthly': 1, 'adhoc': 2 }
    combined.sort((a, b) => {
      const typeDiff = (typeOrder[a.type] || 0) - (typeOrder[b.type] || 0)
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

  const getTypeLabel = (type: BudgetType) => {
    switch (type) {
      case 'income': return 'Income'
      case 'monthly': return 'Monthly Expense'
      case 'adhoc': return 'Ad Hoc Expense'
      default: return 'Expense'
    }
  }

  const getBadgeClass = (type: BudgetType) => {
    switch (type) {
      case 'income': return 'badge-success'
      case 'adhoc': return 'badge-warning'
      default: return 'badge-secondary'
    }
  }

  const totalBudget = userCategories
    .filter(c => c.type !== 'income') // Sum expenses
    .reduce((sum, cat) => sum + cat.amount, 0)

  const totalIncome = userCategories
    .filter(c => c.type === 'income')
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
              <select className="form-select" value={customType} onChange={e => setCustomType(e.target.value as BudgetType)}>
                <option value="income">Income</option>
                <option value="monthly">Monthly Expense</option>
                <option value="adhoc">Ad Hoc Expense</option>
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
