import { useEffect, useState } from 'react'

import { getDoc, doc, updateDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import DashboardReport from '../components/DashboardReport'
import './Dashboard.css'



export default function Dashboard() {
  const { currentUser } = useAuth()

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
    <div className="dashboard-container">
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





      <DashboardReport currentUser={currentUser} monthStartDay={monthStartDay} />
    </div>
  )
}



