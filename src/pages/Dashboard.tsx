import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, query, where, getDocs, Timestamp, getDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import DashboardReport from '../components/DashboardReport'
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
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [showSettings, setShowSettings] = useState(false)

  useEffect(() => {
    if (!currentUser) return

    async function loadData() {
      try {
        // Load User Settings
        const userDoc = await getDoc(doc(db, 'users', currentUser!.uid))
        if (userDoc.exists() && userDoc.data().monthStartDay) {
          setMonthStartDay(userDoc.data().monthStartDay)
        }

        // Get budget categories
        const budgetQuery = query(
          collection(db, 'budgets'),
          where('userId', '==', currentUser!.uid)
        )
        const budgetSnapshot = await getDocs(budgetQuery)

        let totalBudget = 0
        let categoryCount = 0

        budgetSnapshot.forEach((doc) => {
          const data = doc.data()
          totalBudget += data.amount || 0
          categoryCount++
        })

        // Get transactions for current month (using simple 1st-to-Last logic for the Card Summary for now, 
        // to match standard calendar view, OR we should align this Summary to the Custom Start Day too?
        // Let's align it to Custom Start Day for consistency.)

        const now = new Date()
        const currentYear = now.getFullYear()
        const currentMonth = now.getMonth()

        // Calculate start/end based on current day and Start Day setting
        let startOfFiscalMonth: Date
        let endOfFiscalMonth: Date

        if (now.getDate() >= monthStartDay) {
          // Current period: This Month StartDay -> Next Month StartDay
          startOfFiscalMonth = new Date(currentYear, currentMonth, monthStartDay)
          endOfFiscalMonth = new Date(currentYear, currentMonth + 1, monthStartDay)
        } else {
          // Current period: Last Month StartDay -> This Month StartDay
          startOfFiscalMonth = new Date(currentYear, currentMonth - 1, monthStartDay)
          endOfFiscalMonth = new Date(currentYear, currentMonth, monthStartDay)
        }

        const transactionsQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', currentUser!.uid),
          where('date', '>=', Timestamp.fromDate(startOfFiscalMonth)),
          where('date', '<', Timestamp.fromDate(endOfFiscalMonth))
        )
        const transactionsSnapshot = await getDocs(transactionsQuery)

        let totalSpent = 0
        transactionsSnapshot.forEach((doc) => {
          const data = doc.data()
          // Only count expenses (negative amounts)
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

    loadData()
  }, [currentUser, monthStartDay])

  async function handleSaveStartDay() {
    if (!currentUser) return
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        monthStartDay: monthStartDay
      })
      alert('Month start day saved!')
      setShowSettings(false)
    } catch (e) {
      console.error('Error saving settings', e)
      alert('Failed to save settings')
    }
  }

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
        <div>
          <h1>Dashboard</h1>
          <p>Overview of your budget and spending</p>
        </div>
        <button
          className="btn-outline btn-sm"
          onClick={() => setShowSettings(!showSettings)}
        >
          ⚙️ Settings
        </button>
      </div>

      {showSettings && (
        <div className="dashboard-settings-panel">
          <h3>Dashboard Settings</h3>
          <div className="form-group">
            <label>Month Start Day (e.g., 25 for salary date):</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="number"
                min="1"
                max="31"
                value={monthStartDay}
                onChange={(e) => setMonthStartDay(parseInt(e.target.value) || 1)}
                className="form-input"
                style={{ width: '80px' }}
              />
              <button onClick={handleSaveStartDay} className="btn-primary btn-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      <div className="summary-cards">
        <div className="summary-card">
          <h3>Total Budget</h3>
          <p className="summary-amount">R {summary.totalBudget.toFixed(2)}</p>
          <Link to="/budget" className="card-link">Manage Budget →</Link>
        </div>

        <div className="summary-card">
          <h3>Total Spent</h3>
          <p className="summary-amount spent">R {summary.totalSpent.toFixed(2)}</p>
          <div className="card-note-date">Since {monthStartDay}{getOrdinal(monthStartDay)}</div>
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

      <DashboardReport currentUser={currentUser} monthStartDay={monthStartDay} />
    </div>
  )
}

function getOrdinal(n: number) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

