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

interface CategoryData {
  name: string
  type: string
  budget: number
  isIncome: boolean
  months: { [key: string]: number }
}

interface MonthlyTotals {
  income: number
  fixedCosts: number  // Debit orders
  variableExpenses: number  // Monthly/adhoc expenses
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
  const [categoryData, setCategoryData] = useState<CategoryData[]>([])
  const [monthKeys, setMonthKeys] = useState<string[]>([])
  const [monthLabels, setMonthLabels] = useState<string[]>([])
  const [monthlyTotals, setMonthlyTotals] = useState<{ [key: string]: MonthlyTotals }>({})
  const [overBudgetItems, setOverBudgetItems] = useState<OverBudgetItem[]>([])

  // View mode: 'average' (default) or a specific month key like '2024-12'
  const [viewMode, setViewMode] = useState<'average' | string>('average')

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

        // Load system config for groupings and category type mappings
        let loadedGroupings: Grouping[] = []
        const systemCategoryTypes = new Map<string, string>()

        try {
          const systemDoc = await getDoc(doc(db, 'systemConfig', 'main'))
          if (systemDoc.exists()) {
            const sData = systemDoc.data()
            loadedGroupings = sData.groupings || []

            // Index default category type mappings
            if (Array.isArray(sData.defaultCategories)) {
              sData.defaultCategories.forEach((cat: { name?: string, type?: string }) => {
                if (cat?.name && cat?.type) {
                  systemCategoryTypes.set(cat.name.trim().toLowerCase(), cat.type)
                }
              })
            }
          }
        } catch (e) {
          console.error("Error loading system config", e)
        }

        // Fallback groupings if none loaded
        if (loadedGroupings.length === 0) {
          loadedGroupings = [
            { id: 'income', name: 'Income', isIncome: true, sortOrder: 0 },
            { id: 'debit_order', name: 'Debit Orders', isIncome: false, sortOrder: 1 },
            { id: 'monthly', name: 'Monthly Expenses', isIncome: false, sortOrder: 2 }
          ]
        }

        // Groupings loaded - used locally for classification

        // Create a lookup for groupings by ID and name (case-insensitive)
        const groupingById = new Map<string, Grouping>()
        const groupingByName = new Map<string, Grouping>()
        loadedGroupings.forEach(g => {
          groupingById.set(g.id.toLowerCase(), g)
          groupingByName.set(g.name.toLowerCase(), g)
        })

        // Helper to determine if a type is a fixed cost (debit order type)
        const isFixedCostType = (type: string): boolean => {
          const lowerType = type.toLowerCase()
          // Check against grouping IDs and names
          const grouping = groupingById.get(lowerType) || groupingByName.get(lowerType)
          if (grouping) {
            // Fixed costs are typically "debit_order" or similar non-income expense groupings
            // that represent recurring fixed expenses
            return !grouping.isIncome && (
              lowerType.includes('debit') ||
              lowerType.includes('fixed') ||
              grouping.id.toLowerCase() === 'debit_order'
            )
          }
          // Fallback string matching
          return lowerType.includes('debit') || lowerType.includes('fixed')
        }

        // Helper to check if a type represents income
        const isIncomeType = (type: string): boolean => {
          const lowerType = type.toLowerCase()
          const grouping = groupingById.get(lowerType) || groupingByName.get(lowerType)
          if (grouping) {
            return grouping.isIncome
          }
          return lowerType === 'income'
        }

        // Load budgets
        const budgetQuery = query(
          collection(db, 'budgets'),
          where('userId', '==', currentUser!.uid)
        )
        const budgetSnapshot = await getDocs(budgetQuery)
        const budgetMap = new Map<string, CategoryData>()

        console.log('=== Loading Budgets ===')
        console.log('Groupings:', loadedGroupings)
        console.log('System Category Types:', Object.fromEntries(systemCategoryTypes))

        let budgetCount = 0
        let incomeBudgetCount = 0
        budgetSnapshot.forEach((docSnap) => {
          budgetCount++
          const data = docSnap.data()
          const normName = data.name?.trim().toLowerCase() || ''
          // Use system category type if available, otherwise use budget's type
          const catType = systemCategoryTypes.get(normName) || data.type || 'monthly'
          const isInc = isIncomeType(catType)

          if (isInc) {
            incomeBudgetCount++
            console.log(`INCOME Budget: ${data.name}, normName: ${normName}, data.type: ${data.type}, systemType: ${systemCategoryTypes.get(normName)}, resolved catType: ${catType}`)
          }

          if (!budgetMap.has(normName)) {
            budgetMap.set(normName, {
              name: data.name,
              type: catType,
              budget: typeof data.amount === 'number' ? data.amount : parseFloat(data.amount) || 0,
              isIncome: isInc,
              months: {}
            })
            keys.forEach(k => budgetMap.get(normName)!.months[k] = 0)
          }
        })
        console.log(`Loaded ${budgetCount} budgets, ${incomeBudgetCount} are income categories`)

        // Load transactions
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

          // Update category data (for per-category tracking)
          if (budgetMap.has(normCatName)) {
            budgetMap.get(normCatName)!.months[key] += Math.abs(amount)
          }

          // Get category type for classification
          const catData = budgetMap.get(normCatName)
          const catType = catData?.type || systemCategoryTypes.get(normCatName) || 'monthly'

          // Update monthly totals based on amount sign and category type
          // For monthly totals, we track raw per-month values
          if (amount > 0 || isIncomeType(catType)) {
            totals[key].income += Math.abs(amount)
          } else {
            totals[key].totalExpenses += Math.abs(amount)

            // Classify expense by category type
            if (isFixedCostType(catType)) {
              totals[key].fixedCosts += Math.abs(amount)
            } else {
              totals[key].variableExpenses += Math.abs(amount)
            }
          }
        })

        // Calculate net for each month
        keys.forEach(k => {
          totals[k].net = totals[k].income - totals[k].totalExpenses
        })

        // Calculate over-budget items for the latest month (only for expense categories)
        const latestMonth = keys[0]
        const overBudget: OverBudgetItem[] = []

        budgetMap.forEach((cat) => {
          // Skip income categories
          if (cat.isIncome) return

          const actual = cat.months[latestMonth] || 0
          if (cat.budget > 0 && actual > cat.budget) {
            overBudget.push({
              category: cat.name,
              budget: cat.budget,
              actual: actual,
              over: actual - cat.budget
            })
          }
        })

        overBudget.sort((a, b) => b.over - a.over)

        setCategoryData(Array.from(budgetMap.values()))
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

  // Calculate values based on view mode (average or specific month)
  // For averages: calculate per-category average first, then sum (same as DashboardReport)
  const summaryValues = useMemo(() => {
    if (monthKeys.length === 0) return null

    if (viewMode === 'average') {
      // Calculate averages per category, then sum - matching DashboardReport logic exactly
      // Only count non-zero months for each category's average
      let incomeAvgTotal = 0
      let fixedCostsAvgTotal = 0
      let variableExpensesAvgTotal = 0
      let totalExpensesAvgTotal = 0

      // Debug: log category classification
      console.log('=== Category Classification for Averages ===')

      categoryData.forEach(cat => {
        // Get non-zero months for this category
        const monthValues = monthKeys.map(k => cat.months[k] || 0)
        const nonZeroValues = monthValues.filter(v => v > 0)

        if (nonZeroValues.length > 0) {
          const catTotal = nonZeroValues.reduce((a, b) => a + b, 0)
          const catAvg = catTotal / nonZeroValues.length

          // Detailed logging for income categories
          if (cat.isIncome) {
            console.log(`INCOME Category: ${cat.name}`)
            console.log(`  Type: ${cat.type}`)
            console.log(`  Month values: ${JSON.stringify(monthValues)}`)
            console.log(`  Non-zero values: ${JSON.stringify(nonZeroValues)}`)
            console.log(`  Total: ${catTotal}, Count: ${nonZeroValues.length}, Avg: ${catAvg}`)
          } else {
            console.log(`Expense Category: ${cat.name}, Type: ${cat.type}, Total: ${catTotal}, NonZeroMonths: ${nonZeroValues.length}, Avg: ${catAvg}`)
          }

          if (cat.isIncome) {
            incomeAvgTotal += catAvg
          } else {
            totalExpensesAvgTotal += catAvg

            // Classify by type for fixed vs variable
            const lowerType = cat.type.toLowerCase()
            if (lowerType.includes('debit') || lowerType.includes('fixed') || lowerType === 'debit_order') {
              fixedCostsAvgTotal += catAvg
            } else {
              variableExpensesAvgTotal += catAvg
            }
          }
        }
      })

      console.log('=== Final Totals ===')
      console.log(`Income Avg Total: ${incomeAvgTotal}`)
      console.log(`Expenses Avg Total: ${totalExpensesAvgTotal}`)
      console.log(`Fixed Costs Avg: ${fixedCostsAvgTotal}`)
      console.log(`Variable Expenses Avg: ${variableExpensesAvgTotal}`)

      return {
        income: incomeAvgTotal,
        fixedCosts: fixedCostsAvgTotal,
        variableExpenses: variableExpensesAvgTotal,
        totalExpenses: totalExpensesAvgTotal,
        netSavings: incomeAvgTotal - totalExpensesAvgTotal,
        isAverage: true
      }
    } else {
      // Use specific month data
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
  }, [monthlyTotals, monthKeys, viewMode, categoryData])

  // Get top 5 spending categories (excluding income, based on view mode)
  const topCategories = useMemo(() => {
    const catValues = categoryData
      .filter(cat => !cat.isIncome) // Exclude income categories
      .map(cat => {
        let value: number
        if (viewMode === 'average') {
          // Calculate average using non-zero months
          const nonZeroValues = monthKeys
            .map(k => cat.months[k] || 0)
            .filter(v => v > 0)
          value = nonZeroValues.length > 0
            ? nonZeroValues.reduce((a, b) => a + b, 0) / nonZeroValues.length
            : 0
        } else {
          // Use specific month value
          value = cat.months[viewMode] || 0
        }
        return { name: cat.name, value, type: cat.type }
      })

    return catValues
      .filter(c => c.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 5)
  }, [categoryData, monthKeys, viewMode])

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

  // Get the label for the current view mode
  const getViewModeLabel = () => {
    if (viewMode === 'average') return 'Average'
    const idx = monthKeys.indexOf(viewMode)
    return idx >= 0 ? monthLabels[idx] : viewMode
  }

  // Get last 6 months for charts (reverse to show oldest to newest)
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
