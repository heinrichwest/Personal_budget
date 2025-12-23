import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './Dashboard.css'

interface BudgetSummary {
  totalBudget: number
  totalSpent: number
  remaining: number
  categoryCount: number
}

export default function Dashboard() {
  const { currentUser } = useAuth()
  const [summary, setSummary] = useState<BudgetSummary>({
    totalBudget: 0,
    totalSpent: 0,
    remaining: 0,
    categoryCount: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentUser) return

    async function loadSummary() {
      try {
        // Get budget categories
        const budgetQuery = query(
          collection(db, 'budgets'),
          where('userId', '==', currentUser.uid)
        )
        const budgetSnapshot = await getDocs(budgetQuery)
        
        let totalBudget = 0
        let categoryCount = 0
        
        budgetSnapshot.forEach((doc) => {
          const data = doc.data()
          totalBudget += data.amount || 0
          categoryCount++
        })

        // Get transactions for current month
        const now = new Date()
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)

        const transactionsQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', currentUser.uid),
          where('date', '>=', Timestamp.fromDate(startOfMonth)),
          where('date', '<=', Timestamp.fromDate(endOfMonth))
        )
        const transactionsSnapshot = await getDocs(transactionsQuery)
        
        let totalSpent = 0
        transactionsSnapshot.forEach((doc) => {
          const data = doc.data()
          if (data.amount < 0) {
            totalSpent += Math.abs(data.amount)
          }
        })

        setSummary({
          totalBudget,
          totalSpent,
          remaining: totalBudget - totalSpent,
          categoryCount,
        })
      } catch (error) {
        console.error('Error loading summary:', error)
      } finally {
        setLoading(false)
      }
    }

    loadSummary()
  }, [currentUser])

  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Overview of your budget and spending</p>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <h3>Total Budget</h3>
          <p className="summary-amount">R {summary.totalBudget.toFixed(2)}</p>
          <Link to="/budget" className="card-link">Manage Budget →</Link>
        </div>

        <div className="summary-card">
          <h3>Total Spent</h3>
          <p className="summary-amount spent">R {summary.totalSpent.toFixed(2)}</p>
          <Link to="/transactions" className="card-link">View Transactions →</Link>
        </div>

        <div className="summary-card">
          <h3>Remaining</h3>
          <p className={`summary-amount ${summary.remaining < 0 ? 'over-budget' : 'remaining'}`}>
            R {summary.remaining.toFixed(2)}
          </p>
          <span className="card-note">
            {summary.remaining < 0 ? 'Over budget' : 'Available'}
          </span>
        </div>

        <div className="summary-card">
          <h3>Categories</h3>
          <p className="summary-amount">{summary.categoryCount}</p>
          <span className="card-note">Active budget categories</span>
        </div>
      </div>

      <div className="quick-actions">
        <h2>Quick Actions</h2>
        <div className="action-buttons">
          <Link to="/budget" className="action-btn">
            <span className="action-icon">💰</span>
            <span>Create Budget</span>
          </Link>
          <Link to="/transactions" className="action-btn">
            <span className="action-icon">📄</span>
            <span>Upload Statement</span>
          </Link>
        </div>
      </div>
    </div>
  )
}

