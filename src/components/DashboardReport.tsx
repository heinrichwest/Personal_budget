import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, Timestamp } from 'firebase/firestore'
import { db } from '../config/firebase'
import { BudgetCategory } from '../pages/Budget.tsx'
import './DashboardReport.css'

interface ReportProps {
    currentUser: any
    monthStartDay: number
}




interface CategoryRow {
    id: string
    name: string
    budget: number
    months: { [key: string]: number } // key is format "YYYY-MM"
}

interface SectionData {
    rows: CategoryRow[]
    totalBudget: number
    totalMonths: { [key: string]: number }
}

export default function DashboardReport({ currentUser, monthStartDay }: ReportProps) {
    const [loading, setLoading] = useState(true)
    const [reportData, setReportData] = useState<{
        income: SectionData
        monthly: SectionData
        adhoc: SectionData
        unmapped: { months: { [key: string]: number } }
        monthLabels: string[]
        monthKeys: string[]
    } | null>(null)

    useEffect(() => {
        if (!currentUser) return
        generateReport()
    }, [currentUser, monthStartDay])

    // Helper to get fiscal month key (YYYY-MM) and range for a given date
    function getFiscalMonthInfo(date: Date, startDay: number) {
        let year = date.getFullYear()
        let month = date.getMonth() // 0-11
        const day = date.getDate()

        // If we are before the start day, we belong to the previous month's cycle
        // Example: Start Day 25. Date: Jan 10. Belongs to Dec cycle (Dec 25 - Jan 24).
        if (day < startDay) {
            month--
        }

        // specific handling for year roll-back
        if (month < 0) {
            month = 11
            year--
        }

        const key = `${year}-${String(month + 1).padStart(2, '0')}`

        // Calculate display label (e.g., "Jan 2024")
        // Note: If cycle is Dec 25 - Jan 24, usually people call this "January" expense.
        // Let's call it the month where the period *ends* mostly, or just the month index + 1?
        // If Start Day is 1, Jan 1 - Jan 31 is Jan.
        // If Start Day is 25, Dec 25 - Jan 24... is usually treated as Jan (salary received late Dec for Jan).
        // Let's normalize name to the month index + 1 if startDay > 15 (late month start), otherwise current month.
        // Actually, simple convention: Date(Year, Month, 1) -> Format.
        // Use the computed month index.

        // BUT common salary logic: Paid 25th Jan -> For Feb expenses? Or paid 25th Jan for Jan expenses?
        // User said: "if the person receives a salary on the 25th, their month starts on that date, and not on the 1st."
        // Usually pay on 25th Jan covers (25 Jan - 24 Feb).
        // Let's stick to the computed 'month' being the one the period STARTS in, for technical consistency, 
        // OR shift it by 1 if we want "Spending Month".
        // I will use constraints: Month Key is based on start date. Label can be formatted "Mon - Mon" or just "Month Start".

        const labelDate = new Date(year, month, 1)
        const label = labelDate.toLocaleDateString('default', { month: 'short', year: 'numeric' })

        return { key, label, year, month }
    }

    // Get date range for a specific fiscal month key
    function getRangeForFiscalMonth(year: number, month: number, startDay: number) {
        const start = new Date(year, month, startDay)
        const end = new Date(year, month + 1, startDay) // The start of next month is the exclusive end
        return { start, end }
    }

    async function generateReport() {
        try {
            setLoading(true)

            // 1. Determine the last 3 fiscal months (including current)
            const now = new Date()
            const currentParams = getFiscalMonthInfo(now, monthStartDay)

            const monthKeys: string[] = []
            const monthLabels: string[] = []
            // We want Current, M-1, M-2
            for (let i = 0; i < 3; i++) {

                // Actually, cleaner way:
                // just subtract i months from the "year/month" we found in currentParams
                let y = currentParams.year
                let m = currentParams.month - i
                while (m < 0) { m += 12; y--; }

                const key = `${y}-${String(m + 1).padStart(2, '0')}`
                const labelDate = new Date(y, m, 1)
                const label = labelDate.toLocaleDateString('default', { month: 'short', year: '2-digit' })

                monthKeys.unshift(key) // Prepend so earliest is first
                monthLabels.unshift(label)
            }

            // Calculate global start and end date for query (earliest start to latest end)
            const earliestKeyParts = monthKeys[0].split('-').map(Number)
            const latestKeyParts = monthKeys[monthKeys.length - 1].split('-').map(Number)

            const { start: globalStart } = getRangeForFiscalMonth(earliestKeyParts[0], earliestKeyParts[1] - 1, monthStartDay)
            const { end: globalEnd } = getRangeForFiscalMonth(latestKeyParts[0], latestKeyParts[1] - 1, monthStartDay)

            // 2. Fetch budgets
            const budgetsSnapshot = await getDocs(query(collection(db, 'budgets'), where('userId', '==', currentUser.uid)))
            const budgets = budgetsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as BudgetCategory))

            // 3. Fetch transactions
            const transactionsSnapshot = await getDocs(query(
                collection(db, 'transactions'),
                where('userId', '==', currentUser.uid),
                where('date', '>=', Timestamp.fromDate(globalStart)),
                where('date', '<', Timestamp.fromDate(globalEnd))
            ))

            // 4. Initialize Data Structure
            const initSection = () => ({ rows: [], totalBudget: 0, totalMonths: {} })

            const data: any = {
                income: initSection(),
                monthly: initSection(),
                adhoc: initSection(),
                unmapped: { months: {} }
            }

            // Initialize month totals to 0
            monthKeys.forEach(k => {
                data.income.totalMonths[k] = 0
                data.monthly.totalMonths[k] = 0
                data.adhoc.totalMonths[k] = 0
                data.unmapped.months[k] = 0
            })

            // Map categories to rows
            budgets.forEach(cat => {
                const type = cat.type || 'monthly'
                const section = data[type] ? data[type] : data.monthly // fallback

                const row: CategoryRow = {
                    id: cat.id!,
                    name: cat.name,
                    budget: cat.amount,
                    months: {}
                }
                monthKeys.forEach(k => row.months[k] = 0)

                section.rows.push(row)
                section.totalBudget += cat.amount
            })

            // Sort rows alphabetically
            data.income.rows.sort((a: any, b: any) => a.name.localeCompare(b.name))
            data.monthly.rows.sort((a: any, b: any) => a.name.localeCompare(b.name))
            data.adhoc.rows.sort((a: any, b: any) => a.name.localeCompare(b.name))

            // 5. Process Transactions
            transactionsSnapshot.docs.forEach(doc => {
                const txn = doc.data()
                const date = txn.date.toDate()
                const amount = txn.amount
                const catId = txn.categoryId

                // Determine which month bucket this txn falls into
                // We can't just rely on our pre-calc keys, we must check the date against the range logic
                const info = getFiscalMonthInfo(date, monthStartDay)
                const key = info.key

                if (!monthKeys.includes(key)) return // Outside our view range

                if (!catId) {
                    // Unmapped
                    data.unmapped.months[key] += amount
                } else {
                    // Find the category row
                    let found = false
                        // Check all sections
                        ;['income', 'monthly', 'adhoc'].forEach(type => {
                            const row = data[type].rows.find((r: any) => r.id === catId)
                            if (row) {
                                row.months[key] += amount
                                // Also add to section total
                                data[type].totalMonths[key] += amount
                                found = true
                            }
                        })

                    if (!found) {
                        // Category exists in txn but not in current budgets (maybe deleted)
                        data.unmapped.months[key] += amount
                    }
                }
            })

            setReportData({ ...data, monthLabels, monthKeys })
        } catch (e) {
            console.error("Error generating report", e)
        } finally {
            setLoading(false)
        }
    }

    // Helper to render currency
    const fmt = (n: number) => n.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 0, maximumFractionDigits: 0 })

    if (loading) {
        return (
            <div className="dashboard-report">
                <h2>Monthly Financial Report</h2>
                <div className="loading-report">Generating Report...</div>
            </div>
        )
    }

    if (!reportData) {
        return (
            <div className="dashboard-report">
                <h2>Monthly Financial Report</h2>
                <div className="loading-report">No data available. Please add transactions or budget categories.</div>
            </div>
        )
    }

    const { income, monthly, adhoc, unmapped, monthLabels, monthKeys } = reportData

    const renderSection = (title: string, data: SectionData, isIncome = false) => (
        <div className="report-section">
            <h3 className="section-title">{title}</h3>
            <table className="report-table">
                <thead>
                    <tr>
                        <th>Category</th>
                        <th className="num-col">Budget</th>
                        {monthLabels.map(m => <th key={m} className="num-col">{m}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {data.rows.map(row => (
                        <tr key={row.id}>
                            <td>{row.name}</td>
                            <td className="num-col budget-cell">{fmt(row.budget)}</td>
                            {monthKeys.map(k => (
                                <td key={k} className={`num-col ${!isIncome && row.months[k] > row.budget ? 'over-budget-text' : ''
                                    }`}>
                                    {fmt(Math.abs(row.months[k]))}
                                    {/* Note: showing absolute value for expenses usually looks cleaner in specific expense tables, 
                      but standard accounting keeps signs. 
                      User asked for "actual numbers". 
                      Usually expenses are positive numbers in a budget sheet.
                      Transactions are stored as negative for expenses?
                      Existing app logic: specific category cards showed "R amount".
                      Usually input for transaction is negative or typed as expense.
                      Let's check `Transactions.tsx`. Usually expense is negative.
                      If I sum negative numbers, I get negative total.
                      I should display them as positive for the "Report" of expenses.
                      Income is positive.
                  */}
                                </td>
                            ))}
                        </tr>
                    ))}
                    <tr className="subtotal-row">
                        <td>Total</td>
                        <td className="num-col">{fmt(data.totalBudget)}</td>
                        {monthKeys.map(k => (
                            <td key={k} className="num-col">{fmt(Math.abs(data.totalMonths[k]))}</td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </div>
    )

    return (
        <div className="dashboard-report">
            <h2>Monthly Financial Report</h2>

            {renderSection('Income', income, true)}
            {renderSection('Monthly Expenses', monthly)}
            {renderSection('Ad Hoc Expenses', adhoc)}

            <div className="report-section unmapped-section">
                <h3 className="section-title">Uncategorized</h3>
                <table className="report-table">
                    <tbody>
                        <tr>
                            <td>Unmapped Transactions</td>
                            <td className="num-col">-</td>
                            {monthKeys.map(k => (
                                <td key={k} className="num-col">{fmt(Math.abs(unmapped.months[k]))}</td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}
