import { useEffect, useState, useMemo } from 'react'
import { collection, query, getDocs, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { User } from 'firebase/auth'
import './CategoryDetailAnalysis.css'

interface Props {
  currentUser: User | null
  monthStartDay: number
}

interface Transaction {
  id: string
  date: Date
  description: string
  mappedDescription: string
  amount: number
  categoryName: string
  reportingMonth?: string
}

interface DescriptionRow {
  description: string
  months: { [key: string]: number }
  total: number
  average: number
  nonZeroMonthCount: number
}

export default function CategoryDetailAnalysis({ currentUser, monthStartDay }: Props) {
  const [loading, setLoading] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [monthKeys, setMonthKeys] = useState<string[]>([])
  const [monthLabels, setMonthLabels] = useState<string[]>([])

  // Helper function to get fiscal month info
  function getFiscalMonthInfo(date: Date, startDay: number) {
    let year = date.getFullYear()
    let month = date.getMonth()
    const day = date.getDate()

    if (day < startDay) {
      month--
    }
    if (month < 0) {
      month = 11
      year--
    }

    const key = `${year}-${String(month + 1).padStart(2, '0')}`
    const labelDate = new Date(year, month, 1)
    const label = labelDate.toLocaleDateString('default', { month: 'short', year: '2-digit' })

    return { key, label, year, month }
  }

  function getRangeForFiscalMonth(year: number, month: number, startDay: number) {
    const start = new Date(year, month, startDay)
    const end = new Date(year, month + 1, startDay)
    return { start, end }
  }

  useEffect(() => {
    if (!currentUser) return

    async function loadData() {
      try {
        // Determine month range (last 12 months)
        const now = new Date()
        const currentParams = getFiscalMonthInfo(now, monthStartDay)

        const keys: string[] = []
        const labels: string[] = []

        for (let i = 0; i < 12; i++) {
          let y = currentParams.year
          let m = currentParams.month - i
          while (m < 0) { m += 12; y-- }

          const key = `${y}-${String(m + 1).padStart(2, '0')}`
          const labelDate = new Date(y, m, 1)
          const label = labelDate.toLocaleDateString('default', { month: 'short', year: '2-digit' })

          keys.push(key)
          labels.push(label)
        }

        setMonthKeys(keys)
        setMonthLabels(labels)

        // Calculate date range for query
        const earliestKeyParts = keys[keys.length - 1].split('-').map(Number)
        const latestKeyParts = keys[0].split('-').map(Number)

        const { start: globalStart } = getRangeForFiscalMonth(earliestKeyParts[0], earliestKeyParts[1] - 1, monthStartDay)
        const { end: globalEnd } = getRangeForFiscalMonth(latestKeyParts[0], latestKeyParts[1] - 1, monthStartDay)

        const globalStartMs = globalStart.getTime()
        const globalEndMs = globalEnd.getTime()

        // Load transactions
        const txQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', currentUser!.uid)
        )
        const txSnapshot = await getDocs(txQuery)
        const txList: Transaction[] = []
        const categorySet = new Set<string>()

        txSnapshot.forEach((docSnap) => {
          const data = docSnap.data()
          const categoryName = data.categoryName || ''

          // Parse date
          let date: Date
          try {
            if (data.date && typeof data.date.toDate === 'function') {
              date = data.date.toDate()
            } else if (data.date) {
              date = new Date(data.date)
            } else {
              return
            }
          } catch {
            return
          }

          // Filter by date range
          const time = date.getTime()
          if (time < globalStartMs || time >= globalEndMs) return

          txList.push({
            id: docSnap.id,
            date,
            description: data.description || '',
            mappedDescription: data.mappedDescription || data.description || '',
            amount: data.amount || 0,
            categoryName,
            reportingMonth: data.reportingMonth
          })

          if (categoryName) {
            categorySet.add(categoryName)
          }
        })

        setTransactions(txList)
        const sortedCategories = Array.from(categorySet).sort()
        setCategories(sortedCategories)

        // Set default selected category
        if (sortedCategories.length > 0 && !selectedCategory) {
          setSelectedCategory(sortedCategories[0])
        }

      } catch (error) {
        console.error('Error loading category detail data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [currentUser, monthStartDay])

  // Group transactions by mapped description and month
  const descriptionRows = useMemo(() => {
    if (!selectedCategory || monthKeys.length === 0) return []

    // Filter transactions for selected category
    const filtered = transactions.filter(tx => tx.categoryName === selectedCategory)

    // Group by mapped description
    const descMap = new Map<string, { [key: string]: number }>()

    filtered.forEach(tx => {
      // Determine the month key
      let key: string
      if (tx.reportingMonth) {
        key = tx.reportingMonth
      } else {
        const info = getFiscalMonthInfo(tx.date, monthStartDay)
        key = info.key
      }

      if (!monthKeys.includes(key)) return

      const desc = tx.mappedDescription || tx.description || '(No Description)'

      if (!descMap.has(desc)) {
        const months: { [key: string]: number } = {}
        monthKeys.forEach(k => months[k] = 0)
        descMap.set(desc, months)
      }

      descMap.get(desc)![key] += Math.abs(tx.amount)
    })

    // Convert to array and calculate totals/averages
    const rows: DescriptionRow[] = []
    descMap.forEach((months, description) => {
      const monthValues = monthKeys.map(k => months[k])
      const nonZeroValues = monthValues.filter(v => v > 0)
      const total = monthValues.reduce((a, b) => a + b, 0)
      const average = nonZeroValues.length > 0
        ? nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length
        : 0

      if (total > 0) {
        rows.push({
          description,
          months,
          total,
          average,
          nonZeroMonthCount: nonZeroValues.length
        })
      }
    })

    // Sort by total descending
    rows.sort((a, b) => b.total - a.total)

    return rows
  }, [transactions, selectedCategory, monthKeys, monthStartDay])

  // Calculate category totals per month
  const monthlyTotals = useMemo(() => {
    const totals: { [key: string]: number } = {}
    monthKeys.forEach(k => totals[k] = 0)

    descriptionRows.forEach(row => {
      monthKeys.forEach(k => {
        totals[k] += row.months[k]
      })
    })

    return totals
  }, [descriptionRows, monthKeys])

  // Calculate overall stats
  const categoryStats = useMemo(() => {
    if (descriptionRows.length === 0) return null

    const monthTotals = monthKeys.map(k => monthlyTotals[k])
    const nonZeroMonthTotals = monthTotals.filter(v => v > 0)
    const total = monthTotals.reduce((a, b) => a + b, 0)
    const avg = nonZeroMonthTotals.length > 0
      ? nonZeroMonthTotals.reduce((a, b) => a + b, 0) / nonZeroMonthTotals.length
      : 0
    const max = Math.max(...monthTotals)
    const min = Math.min(...nonZeroMonthTotals.length > 0 ? nonZeroMonthTotals : [0])

    return { avg, max, min, total, monthCount: nonZeroMonthTotals.length }
  }, [monthlyTotals, monthKeys, descriptionRows])

  const formatAmount = (amount: number) => {
    if (amount === 0) return '-'
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (loading) {
    return <div className="loading-detail">Loading category details...</div>
  }

  return (
    <div className="category-detail-analysis">
      {/* Category Selector */}
      <div className="category-selector">
        <label>Select Category:</label>
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="category-dropdown"
        >
          <option value="">-- Select a category --</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {selectedCategory && categoryStats && (
        <>
          {/* Stats Summary */}
          <div className="category-stats">
            <div className="stat-card">
              <span className="stat-label">Monthly Average</span>
              <span className="stat-value">{formatAmount(categoryStats.avg)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Highest Month</span>
              <span className="stat-value high">{formatAmount(categoryStats.max)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Lowest Month</span>
              <span className="stat-value low">{formatAmount(categoryStats.min)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">Total ({categoryStats.monthCount} months)</span>
              <span className="stat-value">{formatAmount(categoryStats.total)}</span>
            </div>
          </div>

          {/* MTM Style Table */}
          <div className="mtm-detail-section">
            <h3>{selectedCategory} - Month-to-Month Breakdown</h3>
            <div className="mtm-detail-wrapper">
              <table className="mtm-detail-table">
                <thead>
                  <tr>
                    <th className="sticky-col desc-col">Description</th>
                    <th className="avg-col">Avg</th>
                    {monthKeys.map((key, idx) => (
                      <th key={key} className="month-col">{monthLabels[idx]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {descriptionRows.map((row, idx) => (
                    <tr key={idx} className="desc-row">
                      <td className="sticky-col desc-col">{row.description}</td>
                      <td className="avg-col num-cell">{formatAmount(row.average)}</td>
                      {monthKeys.map(key => (
                        <td key={key} className="month-col num-cell">
                          {formatAmount(row.months[key])}
                        </td>
                      ))}
                    </tr>
                  ))}

                  {/* Total Row */}
                  <tr className="total-row">
                    <td className="sticky-col desc-col">Total</td>
                    <td className="avg-col num-cell">{formatAmount(categoryStats.avg)}</td>
                    {monthKeys.map(key => (
                      <td key={key} className="month-col num-cell">
                        {formatAmount(monthlyTotals[key])}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedCategory && descriptionRows.length === 0 && (
        <div className="no-transactions">
          No transactions found for {selectedCategory}
        </div>
      )}

      {!selectedCategory && (
        <div className="select-prompt">
          Please select a category to view detailed transactions
        </div>
      )}
    </div>
  )
}
