import React, { useEffect, useState } from 'react'
import { collection, query, where, getDocs, doc, getDoc, updateDoc, setDoc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { BudgetCategory } from '../pages/Budget.tsx'
import './DashboardReport.css'

interface ReportProps {
    currentUser: any
    monthStartDay: number
}




// Basic Transaction Interface
interface Transaction {
    id: string
    date: any // Firestore Timestamp or Date
    description: string
    amount: number
    categoryId?: string
    categoryName?: string
    mappedDescription?: string
    userId: string
    reportingMonth?: string // Format: "YYYY-MM" - used for filtering/grouping
}

interface CellData {
    amount: number
    txns: Transaction[]
}

interface CategoryRow {
    id: string
    name: string
    budget: number
    months: { [key: string]: CellData } // key is format "YYYY-MM"
}

interface SectionData {
    rows: CategoryRow[]
    totalBudget: number
    totalMonths: { [key: string]: number }
}

export default function DashboardReport({ currentUser, monthStartDay }: ReportProps) {
    const [loading, setLoading] = useState(true)
    const [reportData, setReportData] = useState<{
        sections: { [groupId: string]: SectionData }
        groupings: any[] // Store grouping metadata
        unmapped: { months: { [key: string]: CellData } }
        monthLabels: string[]
        monthKeys: string[]
        balances: {
            net: { [key: string]: number }
            income: { [key: string]: CellData }
            expenses: { [key: string]: CellData }
            opening: { [key: string]: number }
            closing: { [key: string]: number }
        }
        initialBalance: number
        grossStats: {
            income: number
            expenses: number
            count: number
        }
        budgetTotals: {
            income: number
            expenses: number
        }
    } | null>(null)

    // Modal States
    const [selectedCell, setSelectedCell] = useState<{ title: string, txns: Transaction[] } | null>(null)
    const [editingTxn, setEditingTxn] = useState<Transaction | null>(null)
    const [allBudgets, setAllBudgets] = useState<BudgetCategory[]>([])

    // Modal Sorting
    const [sortConfig, setSortConfig] = useState<{ field: keyof Transaction | 'mappedDescription', direction: 'asc' | 'desc' }>({ field: 'date', direction: 'desc' })

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
            // We want Current, M-1, ... M-11 (12 months descending)
            for (let i = 0; i < 12; i++) {

                // Subtract i months from current
                let y = currentParams.year
                let m = currentParams.month - i
                while (m < 0) { m += 12; y--; }

                const key = `${y}-${String(m + 1).padStart(2, '0')}`
                const labelDate = new Date(y, m, 1)
                const label = labelDate.toLocaleDateString('default', { month: 'short', year: '2-digit' })

                monthKeys.push(key) // Push so latest is first
                monthLabels.push(label)
            }

            // Calculate global start and end date for query
            // Since we have latest first in array, earliest is at end
            const earliestKeyParts = monthKeys[monthKeys.length - 1].split('-').map(Number)
            const latestKeyParts = monthKeys[0].split('-').map(Number)

            const { start: globalStart } = getRangeForFiscalMonth(earliestKeyParts[0], earliestKeyParts[1] - 1, monthStartDay)
            const { end: globalEnd } = getRangeForFiscalMonth(latestKeyParts[0], latestKeyParts[1] - 1, monthStartDay)

            // 1.5 Fetch System Config for Groupings and Category Mappings
            let groupings: any[] = []
            let systemCategoryTypes = new Map<string, string>()

            try {
                // Previously was getDoc('main'), let's stick to that or query if safer. 
                // SystemConfig.tsx saves to 'main'.
                const systemDoc = await getDoc(doc(db, 'systemConfig', 'main'))
                if (systemDoc.exists()) {
                    const sData = systemDoc.data()
                    groupings = sData.groupings || []

                    // Index default category mappings
                    if (Array.isArray(sData.defaultCategories)) {
                        sData.defaultCategories.forEach((cat: any) => {
                            if (cat && cat.name && cat.type) {
                                systemCategoryTypes.set(cat.name.trim().toLowerCase(), cat.type)
                            }
                        })
                    }
                } else {
                    // Fallback to query if 'main' doc doesn't exist (older versions)
                    const qConfig = await getDocs(collection(db, 'systemConfig'))
                    if (!qConfig.empty) {
                        const sData = qConfig.docs[0].data()
                        groupings = sData.groupings || []
                        if (Array.isArray(sData.defaultCategories)) {
                            sData.defaultCategories.forEach((cat: any) => {
                                // handle both string and object format
                                if (typeof cat === 'object' && cat.name && cat.type) {
                                    systemCategoryTypes.set(cat.name.trim().toLowerCase(), cat.type)
                                }
                            })
                        }
                    }
                }
            } catch (e) {
                console.error("Error loading system config", e)
            }

            // Fallback Groupings
            if (groupings.length === 0) {
                groupings = [
                    { id: 'income', name: 'Income', isIncome: true, sortOrder: 0 },
                    { id: 'monthly', name: 'Monthly Expenses', isIncome: false, sortOrder: 1 },
                    { id: 'adhoc', name: 'Ad Hoc Expenses', isIncome: false, sortOrder: 2 }
                ]
            }
            groupings.sort((a, b) => a.sortOrder - b.sortOrder)

            // 2. Fetch budgets
            const budgetsSnapshot = await getDocs(query(collection(db, 'budgets'), where('userId', '==', currentUser.uid)))
            let allBudgetItems = budgetsSnapshot.docs.map(d => {
                const data = d.data()
                const normName = (data.name || '').trim().toLowerCase()
                const systemType = systemCategoryTypes.get(normName)

                return {
                    id: d.id,
                    ...data,
                    // FORCE Override: If system has a defined type for this category name, USE IT.
                    type: systemType || data.type || 'monthly'
                } as BudgetCategory
            })

            // 3. Fetch transactions (Fetch all for user to avoid Index requirements, then filter in memory)
            const transactionsSnapshot = await getDocs(query(
                collection(db, 'transactions'),
                where('userId', '==', currentUser.uid)
            ))

            // 3.1 Discover "Unbudgeted" Categories used in Transactions
            // If a transaction has a category that isn't in 'budgets', we should treating it as a visible category with 0 budget
            const existingIds = new Set(allBudgetItems.map(b => b.id))
            const existingNames = new Set(allBudgetItems.map(b => b.name.trim().toLowerCase()))

            const discovered: BudgetCategory[] = []

            transactionsSnapshot.docs.forEach(doc => {
                const t = doc.data()
                if (t.categoryId && !existingIds.has(t.categoryId)) {
                    // Check if we already have it in discovered or existing by Name (to avoid dups)
                    const name = (t.categoryName || 'Unknown').trim()
                    const normName = name.toLowerCase()

                    if (name && !existingNames.has(normName)) {
                        // Double check we haven't added it to discovered yet
                        if (!discovered.find(d => d.id === t.categoryId)) {
                            discovered.push({
                                id: t.categoryId,
                                name: t.categoryName || 'Unknown',
                                amount: 0,
                                userId: currentUser.uid,
                                type: 'monthly' // Default to monthly expenses? Or try to guess? 'monthly' is safest fallback
                            })
                            // Add to existing names to prevent re-adding
                            existingNames.add(normName)
                        }
                    }
                }
            })

            // Combine Explicit Budgets + Implicit Discovered Categories
            const combinedBudgets = [...allBudgetItems, ...discovered]

            // Deduplicate by name, prioritizing specific types over generic 'monthly'
            const budgetMap = new Map<string, BudgetCategory>()
            const genericTypes = ['monthly', 'adhoc', 'income', 'monthly expenses', 'adhoc expenses']

            combinedBudgets.forEach(b => {
                const norm = b.name.trim().toLowerCase()
                if (!budgetMap.has(norm)) {
                    budgetMap.set(norm, b)
                } else {
                    const existing = budgetMap.get(norm)!
                    // If existing is generic but new is specific, replace it
                    const existingIsGeneric = !existing.type || genericTypes.includes(existing.type.toLowerCase())
                    const newIsGeneric = !b.type || genericTypes.includes(b.type.toLowerCase())

                    if (existingIsGeneric && !newIsGeneric) {
                        budgetMap.set(norm, b)
                    }
                    // If both specific, prefer the one with higher budget? or just keep first/last?
                    // Currently keep first (existing) unless improved.
                }
            })

            const uniqueBudgets = Array.from(budgetMap.values())
            uniqueBudgets.sort((a, b) => a.name.localeCompare(b.name))

            setAllBudgets(uniqueBudgets)

            // Use combined for rows generation
            const rawBudgets = combinedBudgets

            // 4. Initialize Data Structure
            const initSection = () => ({ rows: [], totalBudget: 0, totalMonths: {} })

            const sections: { [key: string]: SectionData } = {}
            groupings.forEach(g => {
                sections[g.id] = initSection()
                monthKeys.forEach(k => {
                    sections[g.id].totalMonths[k] = 0
                })
            })

            const unmapped = { months: {} as { [key: string]: CellData } }
            monthKeys.forEach(k => unmapped.months[k] = { amount: 0, txns: [] })

            // Map categories to rows

            interface InternalCategoryRow {
                ids: string[]
                name: string
                budget: number
                months: { [key: string]: CellData }
                type: string
            }

            // Map categories to matched rows (Merged by normalized name)
            const rowsMap = new Map<string, InternalCategoryRow>()

            rawBudgets.forEach(cat => {
                const normName = cat.name.trim().toLowerCase()
                const type = cat.type || 'monthly'
                const amount = typeof cat.amount === 'number' ? cat.amount : parseFloat(cat.amount as any) || 0

                if (!rowsMap.has(normName)) {
                    rowsMap.set(normName, {
                        ids: [cat.id!],
                        name: cat.name,
                        budget: amount,
                        months: {},
                        type: type
                    })
                    // Init months
                    monthKeys.forEach(k => rowsMap.get(normName)!.months[k] = { amount: 0, txns: [] })
                } else {
                    const existing = rowsMap.get(normName)!
                    existing.ids.push(cat.id!)
                    existing.budget += amount

                    // Smart Type Merge: If existing is generic 'monthly' but new is specific, upgrade it.
                    if (existing.type === 'monthly' && type !== 'monthly') {
                        existing.type = type
                    }
                }
            })

            // Push merged rows to sections
            // Push merged rows to sections
            rowsMap.forEach((row) => {
                let targetType = row.type
                let targetGroup = groupings.find(g => g.id === targetType)

                // 1. Try case-insensitive ID match
                if (!targetGroup) {
                    targetGroup = groupings.find(g => g.id.toLowerCase() === targetType.toLowerCase())
                    if (targetGroup) targetType = targetGroup.id
                }

                // 2. Try Name match (e.g. type="Debit Orders" matches Group Name "Debit Orders")
                if (!targetGroup) {
                    targetGroup = groupings.find(g => g.name.toLowerCase() === targetType.toLowerCase())
                    if (targetGroup) targetType = targetGroup.id
                }

                // 3. If still not found, Create Dynamic Group 
                // (This happens if user typed a custom Category Type 'Debit Orders' that isn't in system config)
                if (!targetGroup) {
                    // Create ad-hoc group
                    const newId = targetType.replace(/\s+/g, '_').toLowerCase()
                    targetGroup = { id: newId, name: targetType, isIncome: false, sortOrder: 999 } // Append to end
                    groupings.push(targetGroup)
                    sections[newId] = initSection()
                    monthKeys.forEach(k => sections[newId].totalMonths[k] = 0)
                    targetType = newId
                }

                const section = sections[targetType]
                // Final safety check
                if (section) {
                    const finalRow: CategoryRow = {
                        id: row.ids[0],
                        name: row.name,
                        budget: row.budget,
                        months: row.months
                    }
                        ; (finalRow as any).ids = row.ids

                    section.rows.push(finalRow)
                    section.totalBudget += row.budget
                } else {
                    // Should technically never happen due to step 3, but safe fallback
                    const fallback = groupings.find(g => !g.isIncome) || groupings[0]
                    sections[fallback.id].rows.push({
                        id: row.ids[0], name: row.name, budget: row.budget, months: row.months, ids: row.ids
                    } as any)
                    sections[fallback.id].totalBudget += row.budget
                }
            })

            // Sort rows alphabetically in every section
            Object.values(sections).forEach(sec => {
                sec.rows.sort((a: any, b: any) => a.name.localeCompare(b.name))
            })

            // 5. Process Transactions
            const globalStartMs = globalStart.getTime()
            const globalEndMs = globalEnd.getTime()

            let grossIncome = 0
            let grossExpenses = 0
            let grossCount = 0

            transactionsSnapshot.docs.forEach(doc => {
                const txnData = doc.data()
                const txn: Transaction = { id: doc.id, ...txnData } as any
                const amount = txn.amount

                // Gross Stats (All data in system)
                grossCount++
                if (amount > 0) grossIncome += amount
                else grossExpenses += amount

                // Safely convert date
                let date: Date
                try {
                    // Handle Firestore Timestamp or standard Date string/object
                    if (txn.date && typeof txn.date.toDate === 'function') {
                        date = txn.date.toDate()
                    } else if (txn.date) {
                        date = new Date(txn.date)
                    } else {
                        return // No date, skip
                    }
                } catch (e) {
                    return // Invalid date, skip
                }

                // Filter by date range (inclusive start, exclusive end)
                const time = date.getTime()
                if (time < globalStartMs || time >= globalEndMs) return

                const catId = txn.categoryId

                // Use reportingMonth if available, otherwise calculate from date
                let key: string
                if (txn.reportingMonth) {
                    key = txn.reportingMonth
                } else {
                    const info = getFiscalMonthInfo(date, monthStartDay)
                    key = info.key
                }

                // Update transaction date object for usage in UI
                txn.date = date

                if (!monthKeys.includes(key)) return // Outside our view range

                const hasId = !!catId
                const hasName = !!txn.categoryName

                if (!hasId && !hasName) {
                    // Unmapped
                    unmapped.months[key].amount += amount
                    unmapped.months[key].txns.push(txn)
                } else {
                    let found = false

                    // 1. Resolve Best Possible Name for Matching
                    // If we have a category ID, check if it exists in our current budgets. 
                    // If so, use that Budget's name as the truth.
                    let authoritativeName = ''
                    if (hasId) {
                        const sourceCat = rawBudgets.find(b => b.id === catId)
                        if (sourceCat) {
                            authoritativeName = sourceCat.name
                        }
                    }

                    if (!authoritativeName) {
                        authoritativeName = txn.categoryName || ''
                    }

                    const matchName = authoritativeName.replace(/\s+/g, ' ').trim().toLowerCase()

                    // 2. Try match by ID (Strongest Match)
                    if (hasId) {
                        for (const groupId of Object.keys(sections)) {
                            const row = sections[groupId].rows.find((r: any) => r.ids && r.ids.includes(catId))
                            if (row) {
                                row.months[key].amount += amount
                                row.months[key].txns.push(txn)
                                sections[groupId].totalMonths[key] += amount
                                found = true
                                break
                            }
                        }
                    }

                    // 3. Fallback: Try match by Name (if ID match failed or no ID)
                    if (!found && matchName) {
                        for (const groupId of Object.keys(sections)) {
                            // Normalize row name same way
                            const row = sections[groupId].rows.find((r: any) =>
                                r.name.replace(/\s+/g, ' ').trim().toLowerCase() === matchName
                            )
                            if (row) {
                                row.months[key].amount += amount
                                row.months[key].txns.push(txn)
                                sections[groupId].totalMonths[key] += amount
                                found = true
                                break
                            }
                        }
                    }

                    if (!found) {
                        // Truly unmapped relative to current budget list
                        unmapped.months[key].amount += amount
                        unmapped.months[key].txns.push(txn)
                    }
                }
            })

            // 6. Calculate Net and Balances
            // Fetch stored opening balances from user profile
            const userDocSnap = await getDoc(doc(db, 'users', currentUser.uid))
            // const storedBalances = userDocSnap.exists() && userDocSnap.data().openingBalances ? userDocSnap.data().openingBalances : {}

            const balances = {
                net: {} as any,
                income: {} as any,
                expenses: {} as any,
                opening: {} as any,
                closing: {} as any
            }

            // Calculate Net for each month (Income + Expense + Unmapped)
            // Calculate Net for each month (Income + Expense + Unmapped)
            monthKeys.forEach((k) => {
                let monthlyNet = 0
                const monthlyIncome: CellData = { amount: 0, txns: [] }
                const monthlyExpenses: CellData = { amount: 0, txns: [] }

                // Add all section totals
                // Iterate through rows to gather txns
                Object.entries(sections).forEach(([secId, sec]) => {
                    const isInc = groupings.find(g => g.id === secId)?.isIncome

                    sec.rows.forEach(row => {
                        const cell = row.months[k]
                        if (cell.amount !== 0) {
                            if (isInc) {
                                monthlyIncome.amount += cell.amount
                                monthlyIncome.txns.push(...cell.txns)
                            } else {
                                monthlyExpenses.amount += cell.amount
                                monthlyExpenses.txns.push(...cell.txns)
                            }
                            monthlyNet += cell.amount
                        }
                    })
                })

                // Add unmapped
                const unmappedCell = unmapped.months[k]
                if (unmappedCell.amount !== 0) {
                    // Heuristic for unmapped income/expense
                    if (unmappedCell.amount > 0) {
                        monthlyIncome.amount += unmappedCell.amount
                        monthlyIncome.txns.push(...unmappedCell.txns)
                    } else {
                        monthlyExpenses.amount += unmappedCell.amount
                        monthlyExpenses.txns.push(...unmappedCell.txns)
                    }
                    monthlyNet += unmappedCell.amount
                }

                balances.net[k] = monthlyNet
                balances.income[k] = monthlyIncome
                balances.expenses[k] = monthlyExpenses
            })

            // Calculate Opening/Closing flows
            // Determine Opening Balance

            // Fetch generic 'initial report balance' which anchors the earliest month shown
            const initialBalance = userDocSnap.exists() ? (userDocSnap.data().initialReportBalance || 0) : 0

            let runningBalance = 0 // Carry forward

            // Loop backwards through monthKeys (Earliest to Latest)
            for (let i = monthKeys.length - 1; i >= 0; i--) {
                const k = monthKeys[i]

                let opening = 0

                // If it is the earliest month being displayed, use the user's manual "Anchor" balance
                if (i === monthKeys.length - 1) {
                    opening = initialBalance
                } else {
                    opening = runningBalance
                }

                const net = balances.net[k]
                const closing = opening + net

                balances.opening[k] = opening
                balances.closing[k] = closing

                runningBalance = closing
            }

            // Calculate Budget Totals
            let totalIncomeBudget = 0
            let totalExpenseBudget = 0
            groupings.forEach(g => {
                const sec = sections[g.id]
                if (sec) {
                    if (g.isIncome) totalIncomeBudget += sec.totalBudget
                    else totalExpenseBudget += sec.totalBudget
                }
            })

            setReportData({
                sections,
                groupings,
                unmapped,
                monthLabels,
                monthKeys,
                balances,
                initialBalance,
                grossStats: {
                    income: grossIncome,
                    expenses: grossExpenses,
                    count: grossCount
                },
                budgetTotals: {
                    income: totalIncomeBudget,
                    expenses: totalExpenseBudget
                }
            })

        } catch (e) {
            console.error("Error generating report", e)
        } finally {
            setLoading(false)
        }
    }

    // Helper to render currency
    const fmt = (n: number) => n === 0 ? '-' : Math.round(n).toLocaleString('en-ZA').replace(/,/g, ' ')

    const handleCellClick = (title: string, cellData: CellData) => {
        if (!cellData || cellData.txns.length === 0) return
        setSortConfig({ field: 'date', direction: 'desc' }) // Reset default sort
        setSelectedCell({
            title: title,
            txns: cellData.txns
        })
    }

    const handleSort = (field: keyof Transaction | 'mappedDescription') => {
        setSortConfig(prev => ({
            field,
            direction: prev.field === field && prev.direction === 'asc' ? 'desc' : 'asc'
        }))
    }

    const getSortedTxns = () => {
        if (!selectedCell) return []
        return [...selectedCell.txns].sort((a, b) => {
            const { field, direction } = sortConfig
            let valA: any = a[field as keyof Transaction]
            let valB: any = b[field as keyof Transaction]

            // Special handling for mappedDescription fallback
            if (field === 'mappedDescription') {
                valA = a.mappedDescription || a.description
                valB = b.mappedDescription || b.description
            }
            if (field === 'date') {
                // Handle Firestore Timestamp or Date object or string
                valA = a.date && typeof a.date.toDate === 'function' ? a.date.toDate().getTime() : new Date(a.date).getTime()
                valB = b.date && typeof b.date.toDate === 'function' ? b.date.toDate().getTime() : new Date(b.date).getTime()
            }
            if (typeof valA === 'string') valA = valA.toLowerCase()
            if (typeof valB === 'string') valB = valB.toLowerCase()

            if (valA < valB) return direction === 'asc' ? -1 : 1
            if (valA > valB) return direction === 'asc' ? 1 : -1
            return 0
        })
    }

    const handleUpdateTransaction = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!editingTxn) return

        try {
            // Build update object, only including defined values
            const updateData: Record<string, any> = {}

            if (editingTxn.description !== undefined) {
                updateData.description = editingTxn.description
            }
            if (editingTxn.mappedDescription !== undefined) {
                updateData.mappedDescription = editingTxn.mappedDescription
            }
            if (editingTxn.categoryId !== undefined) {
                updateData.categoryId = editingTxn.categoryId || null
            }
            if (editingTxn.categoryName !== undefined) {
                updateData.categoryName = editingTxn.categoryName || null
            }
            if (editingTxn.reportingMonth) {
                updateData.reportingMonth = editingTxn.reportingMonth
            }

            await updateDoc(doc(db, 'transactions', editingTxn.id), updateData)

            // Close modals and reload
            setEditingTxn(null)
            setSelectedCell(null)
            generateReport()
        } catch (err: any) {
            console.error('Failed to update transaction:', err)
            alert(`Failed to update transaction: ${err.message || 'Unknown error'}`)
        }
    }

    // Handle Budget Update
    const handleBudgetUpdate = async (rowId: string, newValue: string) => {
        const val = parseFloat(newValue)
        if (isNaN(val)) return

        // blocked updates if reportData is missing
        if (!reportData) return

        try {
            // 1. Optimistically Update State
            // Deep copy structure we intend to mutate
            const newReportData = { ...reportData }
            const newSections = { ...newReportData.sections }

            let found = false
            for (const unionId of Object.keys(newSections)) {
                // Find section containing this row
                const section = newSections[unionId]
                const rowIndex = section.rows.findIndex(r => r.id === rowId)

                if (rowIndex !== -1) {
                    // Create new reference for section to trigger re-render
                    const newSection = {
                        ...section,
                        rows: [...section.rows]
                    }

                    const oldRow = newSection.rows[rowIndex]
                    const diff = val - oldRow.budget

                    // Update Row
                    newSection.rows[rowIndex] = {
                        ...oldRow,
                        budget: val
                    }

                    // Update Section Total
                    newSection.totalBudget += diff

                    newSections[unionId] = newSection
                    found = true
                    break
                }
            }

            if (found) {
                newReportData.sections = newSections
                setReportData(newReportData)
            }

            // 2. Persist to Firestore (Background)
            await updateDoc(doc(db, 'budgets', rowId), {
                amount: val
            })

            // No need to reload everything
        } catch (e) {
            console.error("Error updating budget", e)
            alert("Failed to update budget. Please refresh.")
            generateReport() // Revert state on error
        }
    }

    const handleInitialBalanceUpdate = async (valStr: string) => {
        // Strip spaces
        const cleanVal = valStr.replace(/\s/g, '').replace(/,/g, '')
        const val = parseFloat(cleanVal)
        if (isNaN(val)) return

        try {
            await setDoc(doc(db, 'users', currentUser.uid), {
                initialReportBalance: val
            }, { merge: true })

            // Reload to recalculate
            generateReport()
        } catch (e) {
            console.error("Error saving initial balance", e)
            alert("Failed to save opening balance")
        }
    }

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

    const { sections, groupings, unmapped, monthLabels, monthKeys } = reportData

    return (
        <div className="dashboard-report">
            <h2>Monthly Financial Report</h2>

            <div className="table-wrapper">
                <table className="report-table">
                    <thead>
                        <tr>
                            <th className="sticky-col first-col">Category</th>
                            <th className="sticky-col second-col num-col">Budget</th>
                            {monthLabels.map(m => <th key={m} className="num-col">{m}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {groupings.map(g => {
                            const data = sections[g.id]
                            if (!data) return null

                            // Determine if we show red for over budget
                            const isIncome = g.isIncome

                            return (
                                <React.Fragment key={g.id}>
                                    {/* Section Header */}
                                    <tr className="section-header-row">
                                        <td className="sticky-col first-col" style={{ fontWeight: 'bold', backgroundColor: '#f0f4f8', color: '#12265E' }}>{g.name}</td>
                                        <td className="sticky-col second-col" style={{ backgroundColor: '#f0f4f8' }}></td>
                                        {monthKeys.map(k => <td key={k} style={{ backgroundColor: '#f0f4f8' }}></td>)}
                                    </tr>

                                    {/* Rows */}
                                    {data.rows.map(row => (
                                        <tr key={row.id}>
                                            <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem' }}>{row.name}</td>
                                            <td className="sticky-col second-col num-col budget-cell">
                                                <input
                                                    type="text"
                                                    defaultValue={row.budget === 0 ? '' : Math.round(row.budget).toLocaleString('en-ZA').replace(/,/g, ' ')} // Display with space separators
                                                    className="budget-input"
                                                    placeholder="0"
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            // Strip spaces before parsing
                                                            const cleanVal = e.currentTarget.value.replace(/\s/g, '').replace(/,/g, '')
                                                            handleBudgetUpdate(row.id, cleanVal)
                                                            e.currentTarget.blur()
                                                        }
                                                    }}
                                                    onBlur={(e) => {
                                                        const cleanVal = e.target.value.replace(/\s/g, '').replace(/,/g, '')
                                                        handleBudgetUpdate(row.id, cleanVal)
                                                    }}
                                                />
                                            </td>
                                            {monthKeys.map(k => (
                                                <td
                                                    key={k}
                                                    className={`num-col ${!isIncome && row.months[k].amount > row.budget ? 'over-budget-text' : ''}`}
                                                    onClick={() => handleCellClick(`${row.name} - ${monthLabels[monthKeys.indexOf(k)]}`, row.months[k])}
                                                    style={{ cursor: 'pointer' }}
                                                    title="Click to view details"
                                                >
                                                    {fmt(Math.abs(row.months[k].amount))}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}

                                    {/* Subtotal */}
                                    <tr className="subtotal-row">
                                        <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem' }}>Total {g.name}</td>
                                        <td className="sticky-col second-col num-col">{fmt(data.totalBudget)}</td>
                                        {monthKeys.map(k => (
                                            <td key={k} className="num-col">{fmt(Math.abs(data.totalMonths[k]))}</td>
                                        ))}
                                    </tr>
                                </React.Fragment>
                            )
                        })}

                        {/* Unmapped Section at the bottom */}
                        <tr className="section-header-row">
                            <td className="sticky-col first-col" style={{ fontWeight: 'bold', backgroundColor: '#fff8f8', color: '#d32f2f' }}>Uncategorized</td>
                            <td className="sticky-col second-col" style={{ backgroundColor: '#fff8f8' }}></td>
                            {monthKeys.map(k => <td key={k} style={{ backgroundColor: '#fff8f8' }}></td>)}
                        </tr>
                        <tr>
                            <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem' }}>Unmapped Transactions</td>
                            <td className="sticky-col second-col num-col">-</td>
                            {monthKeys.map(k => (
                                <td
                                    key={k}
                                    className="num-col"
                                    onClick={() => handleCellClick(`Unmapped - ${monthLabels[monthKeys.indexOf(k)]}`, unmapped.months[k])}
                                    style={{ cursor: 'pointer' }}
                                    title="Click to view details"
                                >
                                    {fmt(Math.abs(unmapped.months[k].amount))}
                                </td>
                            ))}
                        </tr>

                        {/* Balances Section */}
                        <tr className="section-header-row">
                            <td className="sticky-col first-col" style={{ fontWeight: 'bold', backgroundColor: '#e3f2fd', color: '#1565c0' }}>Bank Balances</td>
                            <td className="sticky-col second-col" style={{ backgroundColor: '#e3f2fd' }}></td>
                            {monthKeys.map(k => <td key={k} style={{ backgroundColor: '#e3f2fd' }}></td>)}
                        </tr>

                        {/* Total Income */}
                        <tr>
                            <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem', color: '#2e7d32' }}>Total Income</td>
                            <td className="sticky-col second-col num-col">{fmt(reportData.budgetTotals.income)}</td>
                            {monthKeys.map(k => (
                                <td
                                    key={k}
                                    className="num-col"
                                    style={{ color: '#2e7d32', cursor: 'pointer' }}
                                    onClick={() => handleCellClick(`Income - ${monthLabels[monthKeys.indexOf(k)]}`, reportData.balances.income[k])}
                                >
                                    {fmt(reportData.balances.income[k].amount)}
                                </td>
                            ))}
                        </tr>

                        {/* Total Expenses */}
                        <tr>
                            <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem', color: '#c62828' }}>Total Expenses</td>
                            <td className="sticky-col second-col num-col">{fmt(reportData.budgetTotals.expenses)}</td>
                            {monthKeys.map(k => (
                                <td
                                    key={k}
                                    className="num-col"
                                    style={{ color: '#c62828', cursor: 'pointer' }}
                                    onClick={() => handleCellClick(`Expenses - ${monthLabels[monthKeys.indexOf(k)]}`, reportData.balances.expenses[k])}
                                >
                                    {fmt(Math.abs(reportData.balances.expenses[k].amount))}
                                </td>
                            ))}
                        </tr>

                        {/* Net Surplus/Deficit */}
                        <tr>
                            <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem', fontWeight: 500 }}>Net Surplus/Deficit</td>
                            <td className="sticky-col second-col num-col" style={{ fontWeight: 'bold' }}>
                                {fmt(reportData.budgetTotals.income - reportData.budgetTotals.expenses)}
                            </td>
                            {monthKeys.map(k => {
                                const val = reportData.balances.net[k]
                                return (
                                    <td key={k} className="num-col" style={{ color: val < 0 ? '#d32f2f' : '#388e3c', fontWeight: 'bold' }}>
                                        {fmt(val)}
                                    </td>
                                )
                            })}
                        </tr>

                        {/* Opening Balance (Editable Anchor First) */}
                        <tr>
                            <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem' }}>Opening Balance</td>

                            {/* Input in the 'Budget' column which technically acts as the Anchor Config */}
                            <td className="sticky-col second-col num-col budget-cell">
                                <input
                                    type="text"
                                    defaultValue={reportData.initialBalance ? Math.round(reportData.initialBalance).toLocaleString('en-ZA').replace(/,/g, ' ') : ''}
                                    className="budget-input"
                                    placeholder="0"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            handleInitialBalanceUpdate(e.currentTarget.value)
                                            e.currentTarget.blur()
                                        }
                                    }}
                                    onBlur={(e) => {
                                        handleInitialBalanceUpdate(e.target.value)
                                    }}
                                />
                            </td>

                            {monthKeys.map(k => (
                                <td key={k} className="num-col">
                                    {fmt(reportData.balances.opening[k])}
                                </td>
                            ))}
                        </tr>

                        {/* Closing Balance */}
                        <tr style={{ borderTop: '2px solid #ddd', backgroundColor: '#f9f9f9' }}>
                            <td className="sticky-col first-col" style={{ paddingLeft: '1.5rem', fontWeight: 'bold' }}>Closing Balance</td>
                            <td className="sticky-col second-col num-col">-</td>
                            {monthKeys.map(k => (
                                <td key={k} className="num-col" style={{ fontWeight: 'bold', color: '#12265E' }}>
                                    {fmt(reportData.balances.closing[k])}
                                </td>
                            ))}
                        </tr>

                    </tbody>
                </table>
            </div>

            {/* Drilldown Modal */}
            {selectedCell && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{
                        backgroundColor: 'white', padding: '20px', borderRadius: '8px',
                        maxWidth: '800px', width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
                            <h3 style={{ margin: 0 }}>Details: {selectedCell.title}</h3>
                            <button onClick={() => setSelectedCell(null)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer' }}>×</button>
                        </div>
                        <div style={{ overflowY: 'auto', flex: 1 }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ textAlign: 'left', borderBottom: '1px solid #eee' }}>
                                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSort('date')}>
                                            Date {sortConfig.field === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                        </th>
                                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSort('mappedDescription')}>
                                            Description {sortConfig.field === 'mappedDescription' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                        </th>
                                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSort('amount')}>
                                            Amount {sortConfig.field === 'amount' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                        </th>
                                        <th style={{ padding: '8px', cursor: 'pointer' }} onClick={() => handleSort('categoryName')}>
                                            Category {sortConfig.field === 'categoryName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : '↕'}
                                        </th>
                                        <th style={{ padding: '8px' }}>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {getSortedTxns().map(t => (
                                        <tr key={t.id} style={{ borderBottom: '1px solid #f9f9f9' }}>
                                            <td style={{ padding: '8px' }}>{t.date && typeof t.date.toDate === 'function' ? t.date.toDate().toLocaleDateString() : new Date(t.date).toLocaleDateString()}</td>
                                            <td style={{ padding: '8px' }}>
                                                <div style={{ fontWeight: 500 }}>{t.mappedDescription || t.description}</div>
                                                {t.mappedDescription && <div style={{ fontSize: '0.8em', color: '#999' }}>Original: {t.description}</div>}
                                            </td>
                                            <td style={{ padding: '8px', color: t.amount < 0 ? '#c62828' : '#2e7d32' }}>{t.amount.toFixed(2)}</td>
                                            <td style={{ padding: '8px' }}>{t.categoryName || 'Unmapped'}</td>
                                            <td style={{ padding: '8px' }}>
                                                <button
                                                    onClick={() => setEditingTxn(t)}
                                                    style={{ padding: '4px 12px', cursor: 'pointer', backgroundColor: '#e3f2fd', border: 'none', borderRadius: '4px', color: '#1565c0' }}
                                                >
                                                    Edit
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div style={{ textAlign: 'right', marginTop: '15px', fontWeight: 'bold', borderTop: '1px solid #eee', paddingTop: '10px' }}>
                            Total: {fmt(selectedCell.txns.reduce((sum, t) => sum + t.amount, 0))}
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Transaction Modal */}
            {editingTxn && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1100,
                    display: 'flex', justifyContent: 'center', alignItems: 'center'
                }}>
                    <div style={{ backgroundColor: 'white', padding: '25px', borderRadius: '8px', width: '400px', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
                        <h3 style={{ marginTop: 0 }}>Edit Transaction</h3>
                        <form onSubmit={handleUpdateTransaction}>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#666' }}>Description</label>
                                <input
                                    type="text"
                                    defaultValue={editingTxn.mappedDescription || editingTxn.description}
                                    onChange={e => setEditingTxn({ ...editingTxn, mappedDescription: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                                />
                            </div>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#666' }}>Category</label>
                                <select
                                    defaultValue={editingTxn.categoryId || ''}
                                    onChange={e => {
                                        const cat = allBudgets.find(b => b.id === e.target.value)
                                        setEditingTxn({
                                            ...editingTxn,
                                            categoryId: e.target.value,
                                            categoryName: cat ? cat.name : ''
                                        })
                                    }}
                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                                >
                                    <option value="">Unmapped</option>
                                    {allBudgets.map(b => (
                                        <option key={b.id} value={b.id}>{b.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ marginBottom: '15px' }}>
                                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#666' }}>Reporting Month</label>
                                <select
                                    value={editingTxn.reportingMonth || (editingTxn.date ? (typeof editingTxn.date.toDate === 'function' ? editingTxn.date.toDate() : new Date(editingTxn.date)).toISOString().substring(0, 7) : '')}
                                    onChange={e => setEditingTxn({ ...editingTxn, reportingMonth: e.target.value })}
                                    style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                                >
                                    {reportData?.monthKeys.map(month => (
                                        <option key={month} value={month}>{month}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                                <button type="button" onClick={() => setEditingTxn(null)} style={{ padding: '8px 16px', border: '1px solid #ccc', background: 'white', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                                <button type="submit" style={{ padding: '8px 16px', background: '#1565c0', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Update Transaction</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
