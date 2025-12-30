import { useEffect, useState, useMemo } from 'react'
import { collection, query, getDocs, where, doc, getDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { User } from 'firebase/auth'
import './HighLevelAnalysis.css'

interface Props {
  currentUser: User | null
  monthStartDay: number
}

interface Grouping {
  id: string
  name: string
  isIncome: boolean
  sortOrder: number
}

interface CategoryRow {
  name: string
  type: string  // The grouping ID this category belongs to
  budget: number
  months: { [key: string]: number }
}

interface SectionData {
  rows: CategoryRow[]
  isIncome: boolean
}

interface MonthlyTotals {
  income: number
  fixedCosts: number
  variableExpenses: number
  totalExpenses: number
  net: number
}

interface OverBudgetItem {
  category: string
  budget: number
  actual: number
  over: number
}

export default function HighLevelAnalysis({ currentUser, monthStartDay }: Props) {
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<{ [groupId: string]: SectionData }>({})
  const [monthKeys, setMonthKeys] = useState<string[]>([])
  const [monthLabels, setMonthLabels] = useState<string[]>([])
  const [monthlyTotals, setMonthlyTotals] = useState<{ [key: string]: MonthlyTotals }>({})
  const [overBudgetItems, setOverBudgetItems] = useState<OverBudgetItem[]>([])

  const [viewMode, setViewMode] = useState<'average' | string>('average')

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

        const earliestKeyParts = keys[keys.length - 1].split('-').map(Number)
        const latestKeyParts = keys[0].split('-').map(Number)

        const { start: globalStart } = getRangeForFiscalMonth(earliestKeyParts[0], earliestKeyParts[1] - 1, monthStartDay)
        const { end: globalEnd } = getRangeForFiscalMonth(latestKeyParts[0], latestKeyParts[1] - 1, monthStartDay)

        // Load system config for groupings
        let loadedGroupings: Grouping[] = []

        try {
          const systemDoc = await getDoc(doc(db, 'systemConfig', 'main'))
          if (systemDoc.exists()) {
            const sData = systemDoc.data()
            loadedGroupings = sData.groupings || []
          }
        } catch (e) {
          console.error("Error loading system config", e)
        }

        if (loadedGroupings.length === 0) {
          loadedGroupings = [
            { id: 'income', name: 'Income', isIncome: true, sortOrder: 0 },
            { id: 'debit_order', name: 'Debit Orders', isIncome: false, sortOrder: 1 },
            { id: 'monthly', name: 'Monthly Expenses', isIncome: false, sortOrder: 2 }
          ]
        }

        // Groupings loaded and used for section initialization

        // Initialize sections - matching DashboardReport structure
        const sectionsData: { [key: string]: SectionData } = {}
        loadedGroupings.forEach(g => {
          sectionsData[g.id] = { rows: [], isIncome: g.isIncome }
        })

        // Load budgets and create rows map (same as DashboardReport)
        const budgetQuery = query(
          collection(db, 'budgets'),
          where('userId', '==', currentUser!.uid)
        )
        const budgetSnapshot = await getDocs(budgetQuery)

        interface InternalRow {
          name: string
          type: string
          budget: number
          months: { [key: string]: number }
        }

        const rowsMap = new Map<string, InternalRow>()

        budgetSnapshot.forEach((docSnap) => {
          const data = docSnap.data()
          const normName = data.name?.trim().toLowerCase() || ''
          const type = data.type || 'monthly'
          const amount = typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0

          if (!rowsMap.has(normName)) {
            const months: { [key: string]: number } = {}
            keys.forEach(k => months[k] = 0)
            rowsMap.set(normName, {
              name: data.name,
              type: type,
              budget: amount,
              months
            })
          }
        })

        // Push rows to sections (same logic as DashboardReport)
        rowsMap.forEach((row) => {
          let targetType = row.type
          let targetGroup = loadedGroupings.find(g => g.id === targetType)

          // Case-insensitive ID match
          if (!targetGroup) {
            targetGroup = loadedGroupings.find(g => g.id.toLowerCase() === targetType.toLowerCase())
            if (targetGroup) targetType = targetGroup.id
          }

          // Name match
          if (!targetGroup) {
            targetGroup = loadedGroupings.find(g => g.name.toLowerCase() === targetType.toLowerCase())
            if (targetGroup) targetType = targetGroup.id
          }

          // Create dynamic group if not found
          if (!targetGroup) {
            const newId = targetType.replace(/\s+/g, '_').toLowerCase()
            targetGroup = { id: newId, name: targetType, isIncome: false, sortOrder: 999 }
            loadedGroupings.push(targetGroup)
            sectionsData[newId] = { rows: [], isIncome: false }
            targetType = newId
          }

          const section = sectionsData[targetType]
          if (section) {
            section.rows.push({
              name: row.name,
              type: targetType,
              budget: row.budget,
              months: row.months
            })
          }
        })

        // Load transactions and assign to rows (same as DashboardReport)
        const txQuery = query(
          collection(db, 'transactions'),
          where('userId', '==', currentUser!.uid)
        )
        const txSnapshot = await getDocs(txQuery)

        const globalStartMs = globalStart.getTime()
        const globalEndMs = globalEnd.getTime()

        // Initialize monthly totals
        const totals: { [key: string]: MonthlyTotals } = {}
        keys.forEach(k => {
          totals[k] = { income: 0, fixedCosts: 0, variableExpenses: 0, totalExpenses: 0, net: 0 }
        })

        txSnapshot.forEach((docSnap) => {
          const txn = docSnap.data()
          const amount = txn.amount || 0

          let date: Date
          try {
            if (txn.date && typeof txn.date.toDate === 'function') {
              date = txn.date.toDate()
            } else if (txn.date) {
              date = new Date(txn.date)
            } else {
              return
            }
          } catch {
            return
          }

          const time = date.getTime()
          if (time < globalStartMs || time >= globalEndMs) return

          let key: string
          if (txn.reportingMonth) {
            key = txn.reportingMonth
          } else {
            const info = getFiscalMonthInfo(date, monthStartDay)
            key = info.key
          }

          if (!keys.includes(key)) return

          const catName = txn.categoryName || ''
          const normCatName = catName.trim().toLowerCase()

          // Find the row this transaction belongs to
          let found = false
          for (const groupId of Object.keys(sectionsData)) {
            const row = sectionsData[groupId].rows.find(r =>
              r.name.trim().toLowerCase() === normCatName
            )
            if (row) {
              // Add transaction amount to the row (use raw amount like DashboardReport)
              row.months[key] += amount
              found = true
              break
            }
          }

          // Update monthly totals based on which section the transaction belongs to
          if (found) {
            for (const groupId of Object.keys(sectionsData)) {
              const section = sectionsData[groupId]
              const row = section.rows.find(r => r.name.trim().toLowerCase() === normCatName)
              if (row) {
                if (section.isIncome) {
                  totals[key].income += Math.abs(amount)
                } else {
                  totals[key].totalExpenses += Math.abs(amount)
                  // Classify as fixed or variable
                  if (groupId === 'debit_order' || groupId.includes('debit') || groupId.includes('fixed')) {
                    totals[key].fixedCosts += Math.abs(amount)
                  } else {
                    totals[key].variableExpenses += Math.abs(amount)
                  }
                }
                break
              }
            }
          }
        })

        // Calculate net for each month
        keys.forEach(k => {
          totals[k].net = totals[k].income - totals[k].totalExpenses
        })

        // Calculate over-budget items for latest month
        const latestMonth = keys[0]
        const overBudget: OverBudgetItem[] = []

        Object.values(sectionsData).forEach(section => {
          if (section.isIncome) return
          section.rows.forEach(row => {
            const actual = Math.abs(row.months[latestMonth] || 0)
            if (row.budget > 0 && actual > row.budget) {
              overBudget.push({
                category: row.name,
                budget: row.budget,
                actual: actual,
                over: actual - row.budget
              })
            }
          })
        })

        overBudget.sort((a, b) => b.over - a.over)

        setSections(sectionsData)
        setMonthlyTotals(totals)
        setOverBudgetItems(overBudget)

      } catch (error) {
        console.error('Error loading high level data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [currentUser, monthStartDay])

  // Calculate values based on view mode - EXACTLY matching DashboardReport
  const summaryValues = useMemo(() => {
    if (monthKeys.length === 0 || Object.keys(sections).length === 0) return null

    if (viewMode === 'average') {
      // Calculate per-category averages, then sum - EXACTLY like DashboardReport lines 1073-1140
      let incomeAvgTotal = 0
      let fixedCostsAvgTotal = 0
      let variableExpensesAvgTotal = 0
      let totalExpensesAvgTotal = 0

      Object.entries(sections).forEach(([groupId, section]) => {
        section.rows.forEach(row => {
          // Use Math.abs like DashboardReport line 1080
          const monthValues = monthKeys.map(k => Math.abs(row.months[k] || 0))
          const nonZeroValues = monthValues.filter(v => v > 0)

          if (nonZeroValues.length > 0) {
            const rowAvg = nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length

            if (section.isIncome) {
              incomeAvgTotal += rowAvg
            } else {
              totalExpensesAvgTotal += rowAvg
              // Classify as fixed or variable
              if (groupId === 'debit_order' || groupId.includes('debit') || groupId.includes('fixed')) {
                fixedCostsAvgTotal += rowAvg
              } else {
                variableExpensesAvgTotal += rowAvg
              }
            }
          }
        })
      })

      return {
        income: incomeAvgTotal,
        fixedCosts: fixedCostsAvgTotal,
        variableExpenses: variableExpensesAvgTotal,
        totalExpenses: totalExpensesAvgTotal,
        netSavings: incomeAvgTotal - totalExpensesAvgTotal,
        isAverage: true
      }
    } else {
      const monthData = monthlyTotals[viewMode]
      if (!monthData) return null

      return {
        income: monthData.income,
        fixedCosts: monthData.fixedCosts,
        variableExpenses: monthData.variableExpenses,
        totalExpenses: monthData.totalExpenses,
        netSavings: monthData.net,
        isAverage: false
      }
    }
  }, [sections, monthlyTotals, monthKeys, viewMode])

  // Get top 5 spending categories (excluding income)
  const topCategories = useMemo(() => {
    const catValues: { name: string, value: number }[] = []

    Object.entries(sections).forEach(([, section]) => {
      if (section.isIncome) return // Skip income

      section.rows.forEach(row => {
        let value: number
        if (viewMode === 'average') {
          const monthValues = monthKeys.map(k => Math.abs(row.months[k] || 0))
          const nonZeroValues = monthValues.filter(v => v > 0)
          value = nonZeroValues.length > 0
            ? nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length
            : 0
        } else {
          value = Math.abs(row.months[viewMode] || 0)
        }

        if (value > 0) {
          catValues.push({ name: row.name, value })
        }
      })
    })

    return catValues
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [sections, monthKeys, viewMode])

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount)
  }

  if (loading) {
    return <div className="loading-analysis">Loading analysis...</div>
  }

  if (!summaryValues) {
    return <div className="loading-analysis">No data available</div>
  }

  const maxCategoryValue = topCategories.length > 0 ? topCategories[0].value : 1

  const getViewModeLabel = () => {
    if (viewMode === 'average') return 'Average'
    const idx = monthKeys.indexOf(viewMode)
    return idx >= 0 ? monthLabels[idx] : viewMode
  }

  const chartMonths = monthKeys.slice(0, 6).reverse()
  const chartLabels = monthLabels.slice(0, 6).reverse()
  const maxNet = Math.max(...chartMonths.map(k => Math.abs(monthlyTotals[k]?.net || 0)), 1)

  return (
    <div className="high-level-analysis">
      {/* View Mode Selector */}
      <div className="view-mode-selector">
        <label>View:</label>
        <select
          value={viewMode}
          onChange={(e) => setViewMode(e.target.value)}
          className="view-mode-dropdown"
        >
          <option value="average">Average (All Months)</option>
          {monthKeys.slice(0, 12).map((key, idx) => (
            <option key={key} value={key}>{monthLabels[idx]}</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="analysis-summary-cards">
        <div className="analysis-card">
          <h3>{summaryValues.isAverage ? 'Avg Monthly' : getViewModeLabel()} Income</h3>
          <div className="card-amount income">{formatAmount(summaryValues.income)}</div>
        </div>
        <div className="analysis-card">
          <h3>{summaryValues.isAverage ? 'Avg' : getViewModeLabel()} Fixed Costs</h3>
          <div className="card-amount expense">{formatAmount(summaryValues.fixedCosts)}</div>
        </div>
        <div className="analysis-card">
          <h3>{summaryValues.isAverage ? 'Avg' : getViewModeLabel()} Variable Expenses</h3>
          <div className="card-amount expense">{formatAmount(summaryValues.variableExpenses)}</div>
        </div>
        <div className="analysis-card">
          <h3>{summaryValues.isAverage ? 'Avg' : getViewModeLabel()} Total Spend</h3>
          <div className="card-amount expense">{formatAmount(summaryValues.totalExpenses)}</div>
        </div>
      </div>

      <div className="analysis-grid">
        {/* Top Spending Categories */}
        <div className="analysis-section">
          <h3>Top 5 Spending Categories {viewMode === 'average' ? '(Avg)' : `(${getViewModeLabel()})`}</h3>
          <div className="top-categories">
            {topCategories.length === 0 ? (
              <div className="no-data">No spending data available</div>
            ) : (
              topCategories.map((cat, index) => (
                <div key={cat.name} className="category-bar-container">
                  <div className="category-rank">{index + 1}</div>
                  <div className="category-info">
                    <div className="category-name">{cat.name}</div>
                    <div className="category-bar-wrapper">
                      <div
                        className="category-bar"
                        style={{ width: `${(cat.value / maxCategoryValue) * 100}%` }}
                      />
                    </div>
                  </div>
                  <div className="category-amount">{formatAmount(cat.value)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Net Savings per Month */}
        <div className="analysis-section">
          <h3>Net Savings per Month</h3>
          <div className="net-savings-chart">
            {chartMonths.map((key, index) => {
              const net = monthlyTotals[key]?.net || 0
              const isPositive = net >= 0
              const barHeight = Math.min((Math.abs(net) / maxNet) * 100, 100)

              return (
                <div key={key} className="net-bar-column">
                  <div className="net-bar-container">
                    <div
                      className={`net-bar ${isPositive ? 'positive' : 'negative'}`}
                      style={{ height: `${barHeight}%` }}
                    />
                  </div>
                  <div className="net-bar-label">{chartLabels[index]}</div>
                  <div className={`net-bar-value ${isPositive ? 'positive' : 'negative'}`}>
                    {formatAmount(net)}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Month-to-Month Table */}
      <div className="analysis-section full-width">
        <h3>Month-to-Month Summary</h3>
        <div className="mtm-table-wrapper">
          <table className="mtm-summary-table">
            <thead>
              <tr>
                <th className="sticky-col">Category</th>
                {monthKeys.slice(0, 6).map((key, idx) => (
                  <th key={key}>{monthLabels[idx]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="income-row">
                <td className="sticky-col">Income</td>
                {monthKeys.slice(0, 6).map((key) => (
                  <td key={key} className="income-value">{formatAmount(monthlyTotals[key]?.income || 0)}</td>
                ))}
              </tr>
              <tr>
                <td className="sticky-col">Fixed Costs (Debit Orders)</td>
                {monthKeys.slice(0, 6).map((key) => (
                  <td key={key}>{formatAmount(monthlyTotals[key]?.fixedCosts || 0)}</td>
                ))}
              </tr>
              <tr>
                <td className="sticky-col">Variable Expenses</td>
                {monthKeys.slice(0, 6).map((key) => (
                  <td key={key}>{formatAmount(monthlyTotals[key]?.variableExpenses || 0)}</td>
                ))}
              </tr>
              <tr className="total-row">
                <td className="sticky-col">Total Expenses</td>
                {monthKeys.slice(0, 6).map((key) => (
                  <td key={key}>{formatAmount(monthlyTotals[key]?.totalExpenses || 0)}</td>
                ))}
              </tr>
              <tr className="net-row">
                <td className="sticky-col">Net Savings</td>
                {monthKeys.slice(0, 6).map((key) => {
                  const net = monthlyTotals[key]?.net || 0
                  return (
                    <td key={key} className={net >= 0 ? 'positive' : 'negative'}>
                      {formatAmount(net)}
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Over Budget Items */}
      {overBudgetItems.length > 0 && (
        <div className="analysis-section full-width over-budget-section">
          <h3>Over Budget This Month ({monthLabels[0]})</h3>
          <div className="over-budget-list">
            {overBudgetItems.map((item) => (
              <div key={item.category} className="over-budget-item">
                <div className="over-budget-category">{item.category}</div>
                <div className="over-budget-details">
                  <span className="budget-label">Budget: {formatAmount(item.budget)}</span>
                  <span className="actual-label">Actual: {formatAmount(item.actual)}</span>
                  <span className="over-label">Over by: {formatAmount(item.over)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
