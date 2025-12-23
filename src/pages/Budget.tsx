import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './Budget.css'

interface BudgetCategory {
  id?: string
  name: string
  amount: number
  userId: string
}

export default function Budget() {
  const { currentUser } = useAuth()
  const [categories, setCategories] = useState<BudgetCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({ name: '', amount: '' })

  useEffect(() => {
    if (!currentUser) return
    loadCategories()
  }, [currentUser])

  async function loadCategories() {
    if (!currentUser) return

    try {
      const q = query(
        collection(db, 'budgets'),
        where('userId', '==', currentUser.uid)
      )
      const snapshot = await getDocs(q)
      const budgetCategories: BudgetCategory[] = []
      snapshot.forEach((doc) => {
        budgetCategories.push({ id: doc.id, ...doc.data() } as BudgetCategory)
      })
      setCategories(budgetCategories)
    } catch (error) {
      console.error('Error loading categories:', error)
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!currentUser) return

    try {
      const amount = parseFloat(formData.amount)
      if (isNaN(amount) || amount <= 0) {
        alert('Please enter a valid amount')
        return
      }

      if (editingId) {
        await updateDoc(doc(db, 'budgets', editingId), {
          name: formData.name,
          amount: amount,
        })
      } else {
        await addDoc(collection(db, 'budgets'), {
          name: formData.name,
          amount: amount,
          userId: currentUser.uid,
          createdAt: new Date(),
        })
      }

      setFormData({ name: '', amount: '' })
      setShowForm(false)
      setEditingId(null)
      loadCategories()
    } catch (error) {
      console.error('Error saving budget:', error)
      alert('Failed to save budget category')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this budget category?')) return

    try {
      await deleteDoc(doc(db, 'budgets', id))
      loadCategories()
    } catch (error) {
      console.error('Error deleting budget:', error)
      alert('Failed to delete budget category')
    }
  }

  function handleEdit(category: BudgetCategory) {
    setFormData({ name: category.name, amount: category.amount.toString() })
    setEditingId(category.id || null)
    setShowForm(true)
  }

  const totalBudget = categories.reduce((sum, cat) => sum + cat.amount, 0)

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
        <p>Create and manage your budget categories</p>
      </div>

      <div className="budget-summary">
        <div className="summary-item">
          <span className="summary-label">Total Budget</span>
          <span className="summary-value">R {totalBudget.toFixed(2)}</span>
        </div>
        <div className="summary-item">
          <span className="summary-label">Categories</span>
          <span className="summary-value">{categories.length}</span>
        </div>
      </div>

      {showForm && (
        <div className="budget-form-card">
          <h2>{editingId ? 'Edit Category' : 'Add Category'}</h2>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="categoryName">Category Name</label>
              <input
                id="categoryName"
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                placeholder="e.g., Groceries, Entertainment, Medical"
              />
            </div>
            <div className="form-group">
              <label htmlFor="categoryAmount">Monthly Budget (R)</label>
              <input
                id="categoryAmount"
                type="number"
                step="0.01"
                min="0"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                required
                placeholder="0.00"
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn-primary">
                {editingId ? 'Update' : 'Add'} Category
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  setFormData({ name: '', amount: '' })
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {!showForm && (
        <button onClick={() => setShowForm(true)} className="btn-primary mb-3">
          + Add Category
        </button>
      )}

      <div className="categories-list">
        {categories.length === 0 ? (
          <div className="empty-state">
            <p>No budget categories yet. Create your first category to get started.</p>
          </div>
        ) : (
          categories.map((category) => (
            <div key={category.id} className="category-card">
              <div className="category-info">
                <h3>{category.name}</h3>
                <p className="category-amount">R {category.amount.toFixed(2)}</p>
              </div>
              <div className="category-actions">
                <button
                  onClick={() => handleEdit(category)}
                  className="btn-outline"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(category.id!)}
                  className="btn-secondary"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

