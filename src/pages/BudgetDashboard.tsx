import { useEffect, useState } from 'react'
import { Step } from 'react-joyride'
import PageTour from '../components/PageTour'
import { getDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import DashboardReport from '../components/DashboardReport'
import HighLevelAnalysis from '../components/HighLevelAnalysis'
import CategoryDetailAnalysis from '../components/CategoryDetailAnalysis'
import BudgetNav from '../components/BudgetNav'
import './BudgetDashboard.css'

type TabType = 'high-level' | 'mtm' | 'detail'

export default function Dashboard() {
  const { currentUser, isAdmin } = useAuth()

  const [loading, setLoading] = useState(true)
  const [monthStartDay, setMonthStartDay] = useState(1)
  const [showSettings, setShowSettings] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('high-level')

  useEffect(() => {
    if (!currentUser) return

    async function loadData() {
      try {
        // Load User Settings
        const userDoc = await getDoc(doc(db, 'users', currentUser!.uid))
        if (userDoc.exists() && userDoc.data().monthStartDay) {
          setMonthStartDay(userDoc.data().monthStartDay)
        }
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

  const tourSteps: Step[] = [
    {
      target: 'body',
      content: 'This is your Personal Budget Dashboard. Here you can analyze your financial habits.',
      placement: 'center',
    },
    {
      target: '.budget-nav-container',
      content: 'Use this navigation bar to switch between Transactions, Mappings, and the "How It Works" guide.',
    },
    ...(isAdmin ? [{
      target: '.dashboard-settings-toggle',
      content: 'Admins can configure global settings like the "Month Start Day" here.',
    }] : []),
    {
      target: '.dashboard-tabs',
      content: 'Switch between different analysis views: High Level, Month-to-Month, or Detailed category breakdown.',
    },
  ]

  return (
    <div className="dashboard-container">
      <PageTour pageId="budget" steps={tourSteps} />
      {/* Shared Budget Navigation */}
      <BudgetNav />

      {/* Settings Button - Only for admins */}
      {isAdmin && (
        <div className="dashboard-settings-toggle">
          <button
            className="btn-outline btn-sm"
            onClick={() => setShowSettings(!showSettings)}
          >
            Settings
          </button>
        </div>
      )}

      {isAdmin && showSettings && (
        <div className="dashboard-settings-panel">
          <h3>Dashboard Settings</h3>
          <div className="form-group">
            <label>Month Start Day (e.g., 25 for salary date):</label>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={monthStartDay}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '')
                  if (val === '') {
                    setMonthStartDay(1)
                  } else {
                    const num = parseInt(val, 10)
                    if (num >= 1 && num <= 31) {
                      setMonthStartDay(num)
                    } else if (num > 31) {
                      setMonthStartDay(31)
                    }
                  }
                }}
                className="form-input"
                style={{ width: '80px', textAlign: 'center' }}
              />
              <button onClick={handleSaveStartDay} className="btn-primary btn-sm">Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'high-level' ? 'active' : ''}`}
          onClick={() => setActiveTab('high-level')}
        >
          High Level Analysis
        </button>
        <button
          className={`tab-button ${activeTab === 'mtm' ? 'active' : ''}`}
          onClick={() => setActiveTab('mtm')}
        >
          MtM Analysis per Category
        </button>
        <button
          className={`tab-button ${activeTab === 'detail' ? 'active' : ''}`}
          onClick={() => setActiveTab('detail')}
        >
          Detail Analysis on a Category
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {activeTab === 'high-level' && (
          <HighLevelAnalysis currentUser={currentUser} monthStartDay={monthStartDay} />
        )}
        {activeTab === 'mtm' && (
          <DashboardReport currentUser={currentUser} monthStartDay={monthStartDay} />
        )}
        {activeTab === 'detail' && (
          <CategoryDetailAnalysis currentUser={currentUser} monthStartDay={monthStartDay} />
        )}
      </div>
    </div>
  )
}
