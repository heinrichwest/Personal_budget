import React, { useEffect, useState } from 'react'
import { collection, query, where, getDocs, addDoc, updateDoc, Timestamp, writeBatch, doc } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import Papa from 'papaparse'
import { format } from 'date-fns'
import './Transactions.css'

interface Transaction {
  id?: string
  date: Date
  description: string
  amount: number
  categoryId?: string
  categoryName?: string
  mappedDescription?: string
  userId: string
  bankStatementId?: string
  // AI Suggestions
  suggestedCategory?: string
  suggestedCategoryName?: string
  suggestedMerchant?: string
}

// ... existing code ...





// Helper to robustly parse dates (handling DD/MM/YYYY which JS often fails on vs MM/DD/YYYY)
// Helper to robustly parse dates (handling DD/MM/YYYY which JS often fails on vs MM/DD/YYYY)
// Helper to robustly parse dates (handling DD/MM/YYYY which JS often fails on vs MM/DD/YYYY)
function parseRobustDate(dateInput: any): Date | null {
  if (!dateInput) return null
  const dateStr = String(dateInput).trim()

  // 1. Try "DD MM YYYY" (Space separated) - explicit request
  const spaceMatch = dateStr.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})/)
  if (spaceMatch) {
    const day = parseInt(spaceMatch[1])
    const month = parseInt(spaceMatch[2]) - 1
    const year = parseInt(spaceMatch[3])
    const d = new Date(year, month, day)
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) return d
  }

  // 2. Try standard ISO (YYYY-MM-DD or YYYY/MM/DD)
  const isoMatch = dateStr.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (isoMatch) {
    return new Date(dateStr)
  }

  // 3. Try DD/MM/YYYY or DD-MM-YYYY
  const dmMatch = dateStr.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmMatch) {
    const day = parseInt(dmMatch[1])
    const month = parseInt(dmMatch[2]) - 1 // JS months are 0-indexed
    const year = parseInt(dmMatch[3])
    const d = new Date(year, month, day)
    // Validate
    if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
      return d
    }
  }

  // 4. Fallback/Standard
  const d = new Date(dateStr)
  if (!isNaN(d.getTime())) {
    return d
  }

  // 5. Try YYYYMMDD
  if (/^\d{8}$/.test(dateStr)) {
    const year = parseInt(dateStr.substring(0, 4))
    const month = parseInt(dateStr.substring(4, 6)) - 1
    const day = parseInt(dateStr.substring(6, 8))
    return new Date(year, month, day)
  }

  return null
}

export default function Transactions() {
  const { currentUser } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showMapping, setShowMapping] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false)
  const [showAIReview, setShowAIReview] = useState(false)
  // ... existing states ...
  const [sortConfig, setSortConfig] = useState<{ field: keyof Transaction, direction: 'asc' | 'desc' } | null>(null)

  // Import Wizard State
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'validation'>('upload')
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvPreview, setCsvPreview] = useState<any[]>([])
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [columnMapping, setColumnMapping] = useState<{
    date: string
    description: string
    amount?: string
    debit?: string
    credit?: string
    balance?: string // for future balance checks
  }>({ date: '', description: '' })

  // Validation State
  const [importStats, setImportStats] = useState<{
    count: number
    minDate: Date | null
    maxDate: Date | null
    totalCredits: number
    totalDebits: number
    netChange: number
    gapWarning?: string
    balanceWarning?: string
  } | null>(null)

  const [balanceCheck, setBalanceCheck] = useState<{
    opening: string // User input string
    closing: string // User input string
  }>({ opening: '', closing: '' })

  useEffect(() => {
    if (!currentUser) return
    loadTransactions()
    loadCategories()
  }, [currentUser])

  async function loadCategories() {
    if (!currentUser) return

    try {
      // 1. Fetch User's existing budget categories
      const q = query(
        collection(db, 'budgets'),
        where('userId', '==', currentUser.uid)
      )
      const userSnapshot = await getDocs(q)
      const userCats: Array<{ id: string; name: string }> = []
      const userCatNames = new Set<string>()

      userSnapshot.forEach((doc) => {
        const data = doc.data()
        userCats.push({ id: doc.id, name: data.name })
        userCatNames.add(data.name.toLowerCase().trim())
      })

      // 2. Fetch System Default Categories
      try {
        // Use getDocs to be safe and find ANY system config document, matching Admin page behavior
        const sysSnapshot = await getDocs(collection(db, 'systemConfig'))

        sysSnapshot.forEach(doc => {
          const data = doc.data()
          const defaults = data.defaultCategories || []

          defaults.forEach((def: any) => {
            const name = typeof def === 'string' ? def : def.name
            const cleanName = name.trim()
            if (!userCatNames.has(cleanName.toLowerCase())) {
              userCatNames.add(cleanName.toLowerCase()) // prevent duplicates
              userCats.push({ id: `NEW:${cleanName}`, name: cleanName })
            }
          })
        })
      } catch (err) {
        console.error("Error loading system defaults", err)
      }

      // Deduplicate categories by name to prevent multiple "Groceries"
      const uniqueMap = new Map<string, { id: string; name: string }>()
      userCats.forEach(cat => {
        const key = cat.name.toLowerCase().trim()
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, cat)
        }
      })

      const uniqueCats = Array.from(uniqueMap.values())

      // Sort alphabetically
      uniqueCats.sort((a, b) => a.name.localeCompare(b.name))

      setCategories(uniqueCats)
    } catch (error) {
      console.error('Error loading categories:', error)
    } finally {
      setCategoriesLoading(false)
    }
  }

  async function loadTransactions() {
    if (!currentUser) return

    try {
      const q = query(
        collection(db, 'transactions'),
        where('userId', '==', currentUser.uid)
      )
      const snapshot = await getDocs(q)
      const trans: Transaction[] = []
      snapshot.forEach((doc) => {
        const data = doc.data()
        trans.push({
          id: doc.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate() : new Date(data.date),
        } as Transaction)
      })

      // Client-side sort to avoid Firestore index requirements
      trans.sort((a, b) => b.date.getTime() - a.date.getTime())

      setTransactions(trans)
    } catch (error: any) {
      console.error('Error loading transactions:', error)
      alert(`Error loading data: ${error.message}`)
      console.error('Error loading transactions:', error)
    } finally {
      setLoading(false)
    }
  }

  // Helper for fuzzy matching (handles & vs and, case, spacing)
  function normalizeMatchText(text: string): string {
    return text
      .toLowerCase()
      .replace(/&/g, ' and ') // Standardize & to and
      .replace(/\s+/g, ' ')   // Collapse multiple spaces
      .trim()
  }

  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUpdatingMappings, setIsUpdatingMappings] = useState(false)

  // Re-apply all mapping rules to all transactions
  async function updateAllMappings() {
    if (!currentUser) return

    setIsUpdatingMappings(true)

    try {
      // Load all mappings
      const mappingSnapshot = await getDocs(collection(db, 'transactionMappings'))

      const systemMappingsMap = new Map<string, { rule: string; mappedDescription: string; categoryId: string; categoryName?: string }>()
      const userMappingsMap = new Map<string, { rule: string; mappedDescription: string; categoryId: string; categoryName?: string }>()

      // Build a map of categoryId -> categoryName from all budgets for resolution
      const budgetSnapshot = await getDocs(collection(db, 'budgets'))
      const budgetCategoryMap = new Map<string, string>()
      budgetSnapshot.forEach(docSnap => {
        const data = docSnap.data()
        if (data.name) {
          budgetCategoryMap.set(docSnap.id, data.name)
        }
      })

      mappingSnapshot.forEach(docSnap => {
        const data = docSnap.data()
        if (data.originalDescription) {
          const rule = normalizeMatchText(data.originalDescription)

          // Resolve categoryName from categoryId if not already set
          let categoryName = data.categoryName
          if (!categoryName && data.categoryId) {
            categoryName = budgetCategoryMap.get(data.categoryId)
          }

          const mappingObj = {
            rule: rule,
            mappedDescription: data.mappedDescription,
            categoryId: data.categoryId,
            categoryName: categoryName
          }

          if (!data.userId || data.userId === 'SYSTEM') {
            systemMappingsMap.set(rule, mappingObj)
          } else if (data.userId === currentUser.uid) {
            userMappingsMap.set(rule, mappingObj)
          }
        }
      })

      // Merge: User overrides System
      const mergedMap = new Map(systemMappingsMap)
      userMappingsMap.forEach((val, key) => mergedMap.set(key, val))

      const mappings = Array.from(mergedMap.values())
      // Sort by rule length (longest first) for better matching
      mappings.sort((a, b) => b.rule.length - a.rule.length)

      // Update all transactions
      let batch = writeBatch(db)
      let batchCount = 0
      let updatedCount = 0

      for (const transaction of transactions) {
        if (!transaction.id) continue

        const normalizedDesc = normalizeMatchText(transaction.description)

        // Find matching rule (exact match first, then includes)
        let match = mappings.find(m => normalizedDesc === m.rule) || mappings.find(m => normalizedDesc.includes(m.rule))

        if (match) {
          // Resolve category: find user's budget by name to get correct categoryId
          let finalCategoryId: string | null = match.categoryId
          let finalCategoryName = match.categoryName

          // Handle "NEW:CategoryName" format - extract the name and look it up or create it
          if (finalCategoryId && finalCategoryId.startsWith('NEW:')) {
            const catNameFromId = finalCategoryId.substring(4) // Remove "NEW:" prefix
            const userCat = categories.find(c => c.name.toLowerCase().trim() === catNameFromId.toLowerCase().trim())
            if (userCat) {
              finalCategoryId = userCat.id
              finalCategoryName = userCat.name
            } else {
              // Category doesn't exist - create it
              const docRef = await addDoc(collection(db, 'budgets'), {
                name: catNameFromId,
                amount: 0,
                userId: currentUser.uid,
                createdAt: new Date()
              })
              finalCategoryId = docRef.id
              finalCategoryName = catNameFromId
              // Add to local categories array so subsequent transactions can find it
              categories.push({ id: docRef.id, name: catNameFromId })
            }
          }
          // If we have a categoryName, find the user's budget with that name
          else if (finalCategoryName) {
            const userCat = categories.find(c => c.name.toLowerCase().trim() === finalCategoryName!.toLowerCase().trim())
            if (userCat) {
              finalCategoryId = userCat.id
              finalCategoryName = userCat.name
            }
          } else if (finalCategoryId) {
            // Try to find category by ID directly
            const cat = categories.find(c => c.id === finalCategoryId)
            if (cat) {
              finalCategoryName = cat.name
            } else {
              // categoryId doesn't exist in user's budgets, try to resolve via budgetCategoryMap
              const catName = budgetCategoryMap.get(finalCategoryId)
              if (catName) {
                // Find user's category with same name
                const userCat = categories.find(c => c.name.toLowerCase().trim() === catName.toLowerCase().trim())
                if (userCat) {
                  finalCategoryId = userCat.id
                  finalCategoryName = userCat.name
                } else {
                  finalCategoryName = catName
                }
              }
            }
          }

          batch.update(doc(db, 'transactions', transaction.id), {
            mappedDescription: match.mappedDescription,
            categoryId: finalCategoryId || null,
            categoryName: finalCategoryName || null
          })

          batchCount++
          updatedCount++

          // Firestore batches are limited to 500 operations
          if (batchCount >= 450) {
            await batch.commit()
            batch = writeBatch(db) // Create new batch after commit
            batchCount = 0
          }
        }
      }

      // Commit remaining batch
      if (batchCount > 0) {
        await batch.commit()
      }

      // Small delay to let Firestore settle before reloading
      await new Promise(resolve => setTimeout(resolve, 500))

      // Reload transactions
      await loadTransactions()

      alert(`Updated ${updatedCount} transactions with mapping rules.`)

    } catch (error) {
      console.error('Error updating mappings:', error)
      alert('Failed to update mappings. See console for details.')
    } finally {
      setIsUpdatingMappings(false)
    }
  }

  async function analyzeWithAI() {
    const unmapped = transactions.filter(t => !t.categoryId && !t.suggestedCategory)
    if (unmapped.length === 0) {
      alert("No unmapped transactions to analyze.")
      return
    }

    const apiKey = (import.meta as any).env.VITE_OPENAI_API_KEY
    if (!apiKey) {
      alert("No OpenAI API Key found. Please add VITE_OPENAI_API_KEY to your .env file.")
      return
    }

    setIsAnalyzing(true)

    try {
      // Process in chunks of 20 to avoid token limits
      const batchSize = 20
      const categoryNames = categories.map(c => c.name).join(", ")

      for (let i = 0; i < unmapped.length; i += batchSize) {
        const chunk = unmapped.slice(i, i + batchSize)

        const prompt = `
              I have a list of bank transactions. Please analyze them and suggest a "Merchant" (clean name) and a matching "Category" from my list.

              CRITICAL RULE for "Merchant":
              - Extract ONLY the brand or franchise name.
              - REMOVE all cities, locations, suburbs, branch codes, and store numbers.
              - REMOVE generic words like "Store", "Shop", "Checkers", etc if attached to a location unless it is the brand itself.
              - REMOVE prefixes like "CROSS-BORDER CARD FEE", "Purchase at", "Debit".
              - If the description is a URL (e.g., "APPLE.COM/BILL"), extract the main name ("Apple").
              
              Examples: 
                - "KFC CENT400723 CENTURION ZA" -> "KFC"
                - "UBER EATS JOHANNESBURG ZA" -> "Uber Eats"
                - "KAUAI IRENE LINK DORINGKLOOF" -> "Kauai"
                - "CHECKERS HYPER MENLYN" -> "Checkers Hyper"
                - "CROSS-BORDER CARD FEE - APPLE.COM/BILL" -> "Apple"
                - "CROSS-BORDER CARD FEE - TEMU.COM" -> "Temu"

              My Categories: ${categoryNames}
              
              Transactions:
              ${chunk.map(t => `ID: ${t.id}, Desc: ${t.description}`).join('\n')}
              
              Return ONLY a valid JSON array of objects with this format:
              [
                { "id": "transaction_id", "merchant": "Merchant Name", "category": "Exact Category Name" }
              ]
              If you can't match a category, use "Uncategorized".
              `

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: "gpt-3.5-turbo",
            messages: [
              { role: "system", content: "You are a helpful financial assistant." },
              { role: "user", content: prompt }
            ],
            temperature: 0.3
          })
        })

        const data = await response.json()
        if (!data.choices || !data.choices[0]) {
          console.error("OpenAI Error:", data)
          continue
        }

        const content = data.choices[0].message.content
        let suggestions = []
        try {
          suggestions = JSON.parse(content)
        } catch (e) {
          // Sometimes gpt adds text, try to extract json
          const jsonMatch = content.match(/\[.*\]/s)
          if (jsonMatch) {
            suggestions = JSON.parse(jsonMatch[0])
          }
        }

        // Save suggestions to Firestore
        const batch = writeBatch(db)
        let updatesCount = 0

        suggestions.forEach((s: any) => {
          const t = chunk.find(tr => tr.id === s.id)
          if (!t || !t.id) return

          // Find category ID
          const cat = categories.find(c => c.name.toLowerCase() === s.category.toLowerCase())

          if (cat) {
            const ref = doc(db, 'transactions', t.id)
            batch.update(ref, {
              suggestedCategory: cat.id,
              suggestedCategoryName: cat.name,
              suggestedMerchant: s.merchant
            })
            updatesCount++
          }
        })

        if (updatesCount > 0) {
          await batch.commit()
        }
      }

      loadTransactions() // Refresh UI
      // alert("AI Analysis Complete!") 
      setShowAIReview(true) // Open the review modal

    } catch (error) {
      console.error("AI Analysis Failed", error)
      alert("An error occurred during AI analysis.")
    } finally {
      setIsAnalyzing(false)
    }
  }

  async function acceptSuggestion(transaction: Transaction) {
    if (!transaction.id || !transaction.suggestedCategory) return

    try {
      await updateDoc(doc(db, 'transactions', transaction.id), {
        categoryId: transaction.suggestedCategory,
        categoryName: transaction.suggestedCategoryName,
        mappedDescription: transaction.suggestedMerchant || transaction.mappedDescription || transaction.description,
        suggestedCategory: null, // Clear usage
        suggestedCategoryName: null,
        suggestedMerchant: null
      })

      loadTransactions()
    } catch (e) {
      console.error("Error accepting suggestion", e)
    }
  }

  async function rejectSuggestion(transaction: Transaction) {
    if (!transaction.id) return
    try {
      // Remove the fields
      await updateDoc(doc(db, 'transactions', transaction.id), {
        suggestedCategory: null,
        suggestedCategoryName: null,
        suggestedMerchant: null
      })
      loadTransactions()
    } catch (e) {
      console.error("Error rejecting suggestion", e)
    }
  }





  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentUser) return

    setUploading(true)
    setCsvFile(file)

    try {
      const text = await file.text()
      // First pass: Parse just enough to get headers and preview
      Papa.parse(text, {
        header: true,
        preview: 5,
        skipEmptyLines: true,
        complete: (results) => {
          if (results.meta.fields) {
            setCsvHeaders(results.meta.fields)
            setCsvPreview(results.data)

            // Auto-guess mapping
            const guess = {
              date: results.meta.fields.find(h => h.toLowerCase().includes('date')) || '',
              description: results.meta.fields.find(h => h.toLowerCase().includes('desc') || h.toLowerCase().includes('details')) || '',
              amount: results.meta.fields.find(h => h.toLowerCase() === 'amount' || h.toLowerCase().includes('value')) || '',
              debit: results.meta.fields.find(h => h.toLowerCase().includes('debit')) || '',
              credit: results.meta.fields.find(h => h.toLowerCase().includes('credit')) || ''
            }
            setColumnMapping(guess)
            setImportStep('mapping')
          }
          setUploading(false)
        },
        error: (err: any) => {
          alert("Error parsing CSV: " + err.message)
          setUploading(false)
        }
      })
    } catch (error: any) {
      console.error('Error reading file:', error)
      alert('Failed to read file')
      setUploading(false)
    }

    // Reset input so same file can be selected again if cancelled
    e.target.value = ''
  }

  // Step 2 -> 3: Validate Data
  async function processValidation() {
    if (!csvFile || !currentUser) return
    setUploading(true)

    try {
      const text = await csvFile.text()
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as any[]
          let totalDebits = 0
          let totalCredits = 0
          let minDate: Date | null = null
          let maxDate: Date | null = null

          // Parse all to get stats
          const parsedRows = rows.map(row => {
            // Extract using mapping
            const dateStr = row[columnMapping.date || '']
            const descStr = row[columnMapping.description || '']
            let amount = 0

            if (columnMapping.amount) {
              // Single Amount Column
              const val = parseFloat(String(row[columnMapping.amount]).replace(/[^\d.-]/g, ''))
              if (!isNaN(val)) amount = val
            } else {
              // Debit/Credit Columns
              let dr = 0, cr = 0
              if (columnMapping.debit) dr = parseFloat(String(row[columnMapping.debit]).replace(/[^\d.-]/g, '')) || 0
              if (columnMapping.credit) cr = parseFloat(String(row[columnMapping.credit]).replace(/[^\d.-]/g, '')) || 0
              amount = Math.abs(cr) - Math.abs(dr) // Credit positive, Debit negative usually? 
              // Wait, Personal finance apps usually treat Expenses (Debit) as negative?
              // Let's stick to: Amount > 0 is Income, Amount < 0 is Expense?
              // Or just store raw. Previous logic: abs(credit) - abs(debit).
            }

            const date = parseRobustDate(dateStr)
            return { date, amount, desc: descStr, raw: row }
          }).filter(r => r.date && r.desc)

          if (parsedRows.length === 0) {
            alert("No valid rows found based on mapping.")
            setUploading(false)
            return
          }

          parsedRows.forEach(r => {
            if (!minDate || r.date! < minDate) minDate = r.date
            if (!maxDate || r.date! > maxDate) maxDate = r.date

            if (r.amount > 0) totalCredits += r.amount
            else totalDebits += Math.abs(r.amount)
          })

          // Gap Analysis
          let gapWarning = undefined
          if (transactions.length > 0 && minDate) {
            // transactions is sorted desc, so [0] is latest
            const lastTxnDate = transactions[0].date
            const importStart = minDate as Date

            const diffTime = Math.abs(importStart.getTime() - lastTxnDate.getTime())
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            if (importStart > lastTxnDate && diffDays > 7) {
              gapWarning = `Warning: There is a gap of ${diffDays} days between your last transaction (${format(lastTxnDate, 'yyyy-MM-dd')}) and the start of this import (${format(importStart, 'yyyy-MM-dd')}). You might be missing data.`
            }
            if (importStart <= lastTxnDate) {
              gapWarning = `Note: The start of this import overlaps with existing data. Duplicates may occur if not careful.`
            }
          }

          setImportStats({
            count: parsedRows.length,
            minDate,
            maxDate,
            totalDebits,
            totalCredits,
            netChange: totalCredits - totalDebits,
            gapWarning
          })
          setImportStep('validation')
          setUploading(false)
        }
      })
    } catch (e) {
      console.error(e)
      setUploading(false)
    }
  }

  // Step 3 -> Finish: Write to DB
  async function finalizeImport() {
    if (!csvFile || !currentUser) return
    setUploading(true)

    try {
      const text = await csvFile.text()
      const result = Papa.parse(text, { header: true, skipEmptyLines: true })
      const rows = result.data as any[]
      const transactionsToAdd: any[] = []

      // Prepare Mappings
      const mappingSnapshot = await getDocs(collection(db, 'transactionMappings'))

      const systemMappingsMap = new Map<string, { rule: string; mappedDescription: string; categoryId: string }>()
      const userMappingsMap = new Map<string, { rule: string; mappedDescription: string; categoryId: string }>()

      mappingSnapshot.forEach(doc => {
        const data = doc.data()
        if (data.originalDescription) {
          const rule = normalizeMatchText(data.originalDescription)
          const mappingObj = {
            rule: rule,
            mappedDescription: data.mappedDescription,
            categoryId: data.categoryId
          }

          if (!data.userId || data.userId === 'SYSTEM') {
            systemMappingsMap.set(rule, mappingObj)
          } else if (data.userId === currentUser.uid) {
            userMappingsMap.set(rule, mappingObj)
          }
        }
      })

      // Merge: User overrides System
      // We start with system, then set user (overwrite)
      const mergedMap = new Map(systemMappingsMap)
      userMappingsMap.forEach((val, key) => mergedMap.set(key, val))

      const mappings = Array.from(mergedMap.values())
      mappings.sort((a, b) => b.rule.length - a.rule.length)

      // Create Statement Record
      const statementRef = await addDoc(collection(db, 'bankStatements'), {
        userId: currentUser.uid,
        fileName: csvFile.name,
        uploadedAt: new Date(),
        transactionCount: rows.length,
      })

      for (const row of rows) {
        const dateStr = row[columnMapping.date || '']
        const descStr = row[columnMapping.description || '']
        let amount = 0
        if (columnMapping.amount) {
          const val = parseFloat(String(row[columnMapping.amount]).replace(/[^\d.-]/g, ''))
          if (!isNaN(val)) amount = val
        } else {
          let dr = 0, cr = 0
          if (columnMapping.debit) dr = parseFloat(String(row[columnMapping.debit]).replace(/[^\d.-]/g, '')) || 0
          if (columnMapping.credit) cr = parseFloat(String(row[columnMapping.credit]).replace(/[^\d.-]/g, '')) || 0
          amount = Math.abs(cr) - Math.abs(dr)
        }

        const date = parseRobustDate(dateStr)
        if (!date || !descStr) continue

        // Mapping Logic
        let mappedDescription = descStr
        let categoryId: string | undefined
        const normalizedDesc = normalizeMatchText(descStr)

        let match = mappings.find(m => normalizedDesc === m.rule.toLowerCase()) || mappings.find(m => normalizedDesc.includes(m.rule))
        if (match) {
          mappedDescription = match.mappedDescription || descStr
          categoryId = match.categoryId
        }

        // Resolve Category Name
        let categoryName: string | undefined
        if (categoryId) {
          if (categoryId.startsWith('NEW:')) {
            categoryName = categoryId.substring(4)
          } else {
            const cat = categories.find(c => c.id === categoryId)
            if (cat) categoryName = cat.name
          }
        }

        transactionsToAdd.push({
          date,
          description: descStr,
          amount,
          mappedDescription,
          userId: currentUser.uid,
          bankStatementId: statementRef.id,
          categoryId: categoryId || null,
          categoryName: categoryName || null
        })
      }

      // Batch Write
      const batchSize = 500
      for (let i = 0; i < transactionsToAdd.length; i += batchSize) {
        const batch = writeBatch(db)
        transactionsToAdd.slice(i, i + batchSize).forEach(t => {
          batch.set(doc(collection(db, 'transactions')), {
            ...t,
            date: Timestamp.fromDate(t.date)
          })
        })
        await batch.commit()
      }

      alert(`Successfully imported ${transactionsToAdd.length} transactions.`)
      setImportStep('upload')
      setCsvFile(null)
      setImportStats(null)
      setBalanceCheck({ opening: '', closing: '' })
      loadTransactions()

    } catch (e: any) {
      console.error(e)
      alert("Import failed: " + e.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleClearData() {
    if (!currentUser) return
    if (!window.confirm("Are you sure you want to clear ALL transactions and bank statements? This cannot be undone.")) {
      return
    }

    setLoading(true)
    try {
      const batchSize = 500

      // 1. Delete Transactions
      const transQ = query(collection(db, 'transactions'), where('userId', '==', currentUser.uid))
      const transSnapshot = await getDocs(transQ)

      const transChunks = []
      for (let i = 0; i < transSnapshot.docs.length; i += batchSize) {
        transChunks.push(transSnapshot.docs.slice(i, i + batchSize))
      }

      for (const chunk of transChunks) {
        const batch = writeBatch(db)
        chunk.forEach(doc => batch.delete(doc.ref))
        await batch.commit()
      }

      // 2. Delete Bank Statements
      const stmtQ = query(collection(db, 'bankStatements'), where('userId', '==', currentUser.uid))
      const stmtSnapshot = await getDocs(stmtQ)

      const stmtChunks = []
      for (let i = 0; i < stmtSnapshot.docs.length; i += batchSize) {
        stmtChunks.push(stmtSnapshot.docs.slice(i, i + batchSize))
      }

      for (const chunk of stmtChunks) {
        const batch = writeBatch(db)
        chunk.forEach(doc => batch.delete(doc.ref))
        await batch.commit()
      }

      setTransactions([])
      alert("All data cleared successfully.")
    } catch (error) {
      console.error("Error clearing data:", error)
      alert("Failed to clear data.")
    } finally {
      setLoading(false)
    }
  }

  async function handleMapTransaction(
    transaction: Transaction,
    categoryId: string,
    mappedDesc: string,
    matchRule: string,
    saveRule: boolean,
    updateSimilar: boolean
  ) {
    if (!currentUser || !transaction.id) return

    const ruleSerialized = normalizeMatchText(matchRule)

    try {
      let finalCategoryId = categoryId
      let finalCategoryName = categories.find(c => c.id === categoryId)?.name

      // Check if this is a new system category that needs to be created for the user
      if (categoryId.startsWith('NEW:')) {
        const newName = categoryId.substring(4)
        try {
          const docRef = await addDoc(collection(db, 'budgets'), {
            name: newName,
            amount: 0, // Default to 0 budget
            userId: currentUser.uid,
            createdAt: new Date()
          })
          finalCategoryId = docRef.id
          finalCategoryName = newName
        } catch (e) {
          console.error("Error creating new category from defaults", e)
          alert("Failed to initialize this category")
          return
        }
      }

      // 1. Always update the CURRENT transaction (Manual Overwrite)
      await updateDoc(doc(db, 'transactions', transaction.id), {
        categoryId: finalCategoryId,
        mappedDescription: mappedDesc,
        categoryName: finalCategoryName,
      })

      // 2. Create/Update the persistent rule (OPTIONAL)
      if (saveRule) {
        // Search specifically for a rule OWNED by this user
        const mappingQuery = query(
          collection(db, 'transactionMappings'),
          where('originalDescription', '==', matchRule),
          where('userId', '==', currentUser.uid)
        )
        const mappingSnapshot = await getDocs(mappingQuery)

        if (!mappingSnapshot.empty) {
          // Update existing personal rule
          await updateDoc(mappingSnapshot.docs[0].ref, {
            mappedDescription: mappedDesc,
            categoryId: finalCategoryId,
            updatedAt: new Date(),
          })
        } else {
          // Create NEW personal rule (shadows any system rule)
          await addDoc(collection(db, 'transactionMappings'), {
            originalDescription: matchRule,
            mappedDescription: mappedDesc,
            categoryId: finalCategoryId,
            userId: currentUser.uid,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
        }
      }

      // 3. Retroactively apply to matches (OPTIONAL)
      let updateCount = 0
      if (updateSimilar) {
        const transactionsToUpdate = transactions.filter(t =>
          t.id !== transaction.id && // Don't double update current
          normalizeMatchText(t.description).includes(ruleSerialized)
        )

        if (transactionsToUpdate.length > 0) {
          const batchSize = 500
          const total = transactionsToUpdate.length

          for (let i = 0; i < total; i += batchSize) {
            const batch = writeBatch(db)
            const chunk = transactionsToUpdate.slice(i, i + batchSize)

            chunk.forEach(t => {
              if (t.id) {
                const ref = doc(db, 'transactions', t.id)
                batch.update(ref, {
                  categoryId: finalCategoryId,
                  mappedDescription: mappedDesc,
                  categoryName: finalCategoryName,
                })
              }
            })
            await batch.commit()
          }
          updateCount = transactionsToUpdate.length
        }
      }

      setShowMapping(false)
      setSelectedTransaction(null)
      loadTransactions()

      if (updateSimilar && updateCount > 0) {
        alert(`Mapping saved. Current transaction and ${updateCount} others updated.`)
      } else {
        alert(`Mapping saved for this transaction.`)
      }

    } catch (error) {
      console.error('Error mapping transaction:', error)
      alert('Failed to save mapping')
    }
  }

  const handleSort = (field: keyof Transaction) => {
    let direction: 'asc' | 'desc' = 'asc'
    if (sortConfig && sortConfig.field === field && sortConfig.direction === 'asc') {
      direction = 'desc'
    }
    setSortConfig({ field, direction })
  }

  const filteredTransactions = transactions.filter(transaction => {
    const search = searchTerm.toLowerCase()
    const matchesSearch = (
      transaction.description.toLowerCase().includes(search) ||
      (transaction.mappedDescription || '').toLowerCase().includes(search) ||
      (transaction.categoryName || '').toLowerCase().includes(search)
    )

    // Updated unmapped logic to be more strictly "No Category assigned"
    // so we don't accidentally hide items that just have suggestions
    const matchesUnmapped = showUnmappedOnly ? !transaction.categoryId : true

    return matchesSearch && matchesUnmapped
  })

  if (sortConfig !== null) {
    filteredTransactions.sort((a, b) => {
      let valA: any = a[sortConfig.field]
      let valB: any = b[sortConfig.field]

      // Handle calculated/display fields
      if (sortConfig.field === 'mappedDescription') {
        valA = a.mappedDescription || a.suggestedMerchant || ''
        valB = b.mappedDescription || b.suggestedMerchant || ''
      } else if (sortConfig.field === 'categoryName') {
        valA = a.categoryName || a.suggestedCategoryName || ''
        valB = b.categoryName || b.suggestedCategoryName || ''
      }

      if (valA === undefined && valB === undefined) return 0
      if (valA === undefined) return 1
      if (valB === undefined) return -1

      if (valA < valB) {
        return sortConfig.direction === 'asc' ? -1 : 1
      }
      if (valA > valB) {
        return sortConfig.direction === 'asc' ? 1 : -1
      }
      return 0
    })
  }

  const unmappedCount = transactions.filter(t => !t.categoryId).length

  // Modal State
  const [matchRuleInput, setMatchRuleInput] = useState('')
  const [saveRule, setSaveRule] = useState(false)
  const [updateSimilar, setUpdateSimilar] = useState(false)

  // Rule Proposal State
  interface ProposedRule {
    id: string
    matchText: string
    cleanName: string
    categoryId: string
    categoryName: string
    affectedTransactionIds: string[]
  }

  const [proposedRules, setProposedRules] = useState<ProposedRule[]>([])
  const [viewingRuleMatches, setViewingRuleMatches] = useState<string | null>(null) // Rule ID

  // Reset modal state when opening
  useEffect(() => {
    if (selectedTransaction) {
      setMatchRuleInput(selectedTransaction.description)
      setSaveRule(false)
      setUpdateSimilar(false)
    }
  }, [selectedTransaction])

  // Generate Rules when modal opens
  useEffect(() => {
    if (showAIReview) {
      generateProposedRules()
    }
  }, [showAIReview, transactions])

  function generateProposedRules() {
    const rulesMap = new Map<string, ProposedRule>()

    // 1. Group by Suggested Merchant (Potential Rule)
    const candidates = transactions.filter(t => t.suggestedMerchant && t.suggestedCategory)

    candidates.forEach(t => {
      const ruleText = t.suggestedMerchant!.trim() // The AI's clean name is our best rule candidate
      const ruleKey = ruleText.toLowerCase()

      if (!rulesMap.has(ruleKey)) {
        // Find all unmapped transactions that match this rule text
        // (This confirms how effective the rule would be)
        const matches = transactions.filter(tr =>
          !tr.categoryId && // Only care about unmapped
          normalizeMatchText(tr.description).includes(normalizeMatchText(ruleText))
        )

        rulesMap.set(ruleKey, {
          id: ruleKey, // temp id
          matchText: ruleText,
          cleanName: t.suggestedMerchant!,
          categoryId: t.suggestedCategory!,
          categoryName: t.suggestedCategoryName!,
          affectedTransactionIds: matches.map(m => m.id as string)
        })
      }
    })

    setProposedRules(Array.from(rulesMap.values()))
  }

  const similarCount = transactions.filter(t =>
    selectedTransaction &&
    t.id !== selectedTransaction.id &&
    normalizeMatchText(t.description).includes(normalizeMatchText(matchRuleInput))
  ).length

  async function handleSaveRule(rule: ProposedRule) {
    if (!currentUser) return

    try {
      const batch = writeBatch(db)

      // 1. Create the persistent Rule
      // We use 'suggestedMerchant' (cleanName) as the mapped description
      const ruleRef = doc(collection(db, 'transactionMappings'))
      batch.set(ruleRef, {
        originalDescription: rule.matchText, // The string we look for
        mappedDescription: rule.cleanName,   // The clean name we apply
        categoryId: rule.categoryId,
        userId: currentUser.uid,
        createdAt: new Date(),
        updatedAt: new Date(),
        source: 'ai_rule_gen'
      })

      // 2. Update ALL affected transactions
      rule.affectedTransactionIds.forEach(id => {
        const ref = doc(db, 'transactions', id)
        batch.update(ref, {
          categoryId: rule.categoryId,
          categoryName: rule.categoryName,
          mappedDescription: rule.cleanName,
          // Clear AI fields
          suggestedCategory: null,
          suggestedCategoryName: null,
          suggestedMerchant: null
        })
      })

      await batch.commit()

      // Remove from list
      setProposedRules(prev => prev.filter(p => p.id !== rule.id))
      loadTransactions()
      alert(`Rule saved! ${rule.affectedTransactionIds.length} transactions updated.`)

    } catch (e) {
      console.error("Error saving rule", e)
      alert("Failed to save rule")
    }
  }


  if (loading) {
    return (
      <div className="container">
        <div className="loading">Loading transactions...</div>
      </div>
    )
  }

  return (
    <div className="container">


      {/* IMPORT WIZARD UI */}
      {importStep === 'mapping' && (
        <div className="import-wizard" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: '2rem' }}>
          <h2>Step 1: Map Columns</h2>
          <p>Please select which columns in your CSV correspond to the required fields.</p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group">
              <label>Date Column</label>
              <select className="form-select" value={columnMapping.date} onChange={e => setColumnMapping({ ...columnMapping, date: e.target.value })}>
                <option value="">-- Select --</option>
                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>Description Column</label>
              <select className="form-select" value={columnMapping.description} onChange={e => setColumnMapping({ ...columnMapping, description: e.target.value })}>
                <option value="">-- Select --</option>
                {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
          </div>

          <div style={{ padding: '1rem', backgroundColor: '#f5f5f5', borderRadius: '4px', marginBottom: '1rem' }}>
            <h4>Amount Mapping</h4>
            <p style={{ fontSize: '0.9rem', color: '#666' }}>Do you have a single Amount column (positive/negative) OR separate Debit/Credit columns?</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
              <div className="form-group">
                <label>Amount Column (Signed)</label>
                <select className="form-select" value={columnMapping.amount || ''} onChange={e => setColumnMapping({ ...columnMapping, amount: e.target.value, debit: '', credit: '' })}>
                  <option value="">-- None --</option>
                  {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>OR</div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <div className="form-group">
                  <label>Debit Column</label>
                  <select className="form-select" value={columnMapping.debit || ''} onChange={e => setColumnMapping({ ...columnMapping, debit: e.target.value, amount: '' })}>
                    <option value="">-- None --</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Credit Column</label>
                  <select className="form-select" value={columnMapping.credit || ''} onChange={e => setColumnMapping({ ...columnMapping, credit: e.target.value, amount: '' })}>
                    <option value="">-- None --</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <h3>Preview (First 5 rows)</h3>
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {csvHeaders.map(h => <th key={h} style={{ borderBottom: '1px solid #ccc', padding: '4px', textAlign: 'left', background: '#eee' }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 5).map((row, i) => (
                  <tr key={i}>
                    {csvHeaders.map(h => <td key={h} style={{ borderBottom: '1px solid #eee', padding: '4px' }}>{row[h]}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={processValidation} disabled={!columnMapping.date || !columnMapping.description || (!columnMapping.amount && (!columnMapping.debit && !columnMapping.credit))}>
              Next: verify Data →
            </button>
            <button className="btn-outline" onClick={() => { setImportStep('upload'); setCsvFile(null); }}>Cancel</button>
          </div>
        </div>
      )}

      {importStep === 'validation' && importStats && (
        <div className="import-wizard" style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '8px', boxShadow: '0 2px 10px rgba(0,0,0,0.1)', marginBottom: '2rem' }}>
          <h2>Step 2: Verify Import</h2>

          <div className="stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1rem' }}>
            <div className="stat-box">
              <label>Transactions</label>
              <div>{importStats.count}</div>
            </div>
            <div className="stat-box">
              <label>Date Range</label>
              <div>
                {importStats.minDate && format(importStats.minDate, 'dd MMM')} - {importStats.maxDate && format(importStats.maxDate, 'dd MMM yyyy')}
              </div>
            </div>
            <div className="stat-box">
              <label>Total Credits</label>
              <div style={{ color: 'green' }}>{importStats.totalCredits.toFixed(2)}</div>
            </div>
            <div className="stat-box">
              <label>Total Debits (Exp)</label>
              <div style={{ color: 'red' }}>{importStats.totalDebits.toFixed(2)}</div>
            </div>
          </div>

          {importStats.gapWarning && (
            <div style={{ padding: '1rem', backgroundColor: '#fff3e0', borderLeft: '4px solid #ff9800', marginBottom: '1rem', color: '#e65100' }}>
              <strong>⚠️ Analysis:</strong> {importStats.gapWarning}
            </div>
          )}
          {!importStats.gapWarning && (
            <div style={{ padding: '1rem', backgroundColor: '#e8f5e9', borderLeft: '4px solid #4caf50', marginBottom: '1rem', color: '#2e7d32' }}>
              ✅ <strong>Analysis:</strong> Data continuity looks good. No major gaps detected from previous transactions.
            </div>
          )}

          <div style={{ padding: '1rem', backgroundColor: '#f8f9fa', borderRadius: '4px', marginBottom: '1.5rem', border: '1px solid #dee2e6' }}>
            <h4>Balance Check (Optional)</h4>
            <p style={{ fontSize: '0.9rem', marginBottom: '10px' }}>Enter the statement balances to verify accuracy.</p>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
              <div className="form-group">
                <label>Opening Balance</label>
                <input type="number" className="form-input" placeholder="0.00" value={balanceCheck.opening} onChange={e => setBalanceCheck({ ...balanceCheck, opening: e.target.value })} />
              </div>
              <div style={{ paddingBottom: '10px', fontWeight: 'bold' }}>+ Net ({importStats.netChange.toFixed(2)}) =</div>
              <div className="form-group">
                <label>Calculated Closing</label>
                <input type="text" className="form-input" disabled value={(parseFloat(balanceCheck.opening || '0') + importStats.netChange).toFixed(2)} />
              </div>
              <div className="form-group">
                <label>Statement Closing</label>
                <input type="number" className="form-input" placeholder="0.00" value={balanceCheck.closing} onChange={e => setBalanceCheck({ ...balanceCheck, closing: e.target.value })} />
              </div>
            </div>
            {balanceCheck.closing && (
              <div style={{ marginTop: '0.5rem', fontWeight: 'bold', color: Math.abs((parseFloat(balanceCheck.opening || '0') + importStats.netChange) - parseFloat(balanceCheck.closing)).toFixed(2) === '0.00' ? 'green' : 'red' }}>
                Difference: {((parseFloat(balanceCheck.opening || '0') + importStats.netChange) - parseFloat(balanceCheck.closing)).toFixed(2)}
              </div>
            )}
          </div>

          <div className="form-actions">
            <button className="btn-primary" onClick={finalizeImport} disabled={uploading}>
              {uploading ? 'Importing...' : '✅ Confirm Import'}
            </button>
            <button className="btn-outline" onClick={() => setImportStep('mapping')}>Back</button>
          </div>
        </div>
      )}


      {/* DEFAULT HEADER (Only show if NOT in wizard mode) */}
      {importStep === 'upload' && (
        <div className="transactions-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1>Transactions</h1>
            <p>Upload bank statements and map transactions to budget categories</p>
            <div style={{ fontSize: '0.85rem', color: '#666', marginTop: '0.5rem', backgroundColor: '#e3f2fd', padding: '0.5rem', borderRadius: '4px', border: '1px solid #bbdefb' }}>
              ℹ️ CSV must include columns for <strong>Date</strong>, <strong>Description</strong>, and <strong>Amount</strong> (or Debits/Credits).
            </div>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '0.5rem' }}>
            <button
              onClick={handleClearData}
              className="btn-outline"
              disabled={uploading || transactions.length === 0}
              style={{ color: '#d32f2f', borderColor: '#d32f2f' }}
            >
              Clear Data
            </button>
            <label className="file-upload-label" style={{ margin: 0 }}>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={uploading || categoriesLoading}
                style={{ display: 'none' }}
              />
              <span className={`btn-primary ${categoriesLoading ? 'disabled' : ''}`}>
                {uploading ? 'Reading...' : categoriesLoading ? 'Loading System...' : 'Upload CSV'}
              </span>
            </label>
          </div>
        </div>
      )}

      {transactions.length > 0 && (
        <div className="stats-cards" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <div className="stat-card" style={{
            flex: 1,
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            borderLeft: '4px solid #f44336'
          }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>Unmapped Transactions</h3>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.5rem' }}>
              <span style={{ fontSize: '1.8rem', fontWeight: 'bold', color: '#d32f2f' }}>{unmappedCount}</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <button
                  onClick={updateAllMappings}
                  className={`btn-sm btn-primary`}
                  disabled={isUpdatingMappings || transactions.length === 0}
                  style={{ fontSize: '0.8rem', backgroundColor: '#2196f3' }}
                >
                  {isUpdatingMappings ? 'Updating...' : 'Update Mappings'}
                </button>
                <button
                  onClick={analyzeWithAI}
                  className={`btn-sm btn-primary`}
                  disabled={isAnalyzing || unmappedCount === 0}
                  style={{ fontSize: '0.8rem', backgroundColor: '#7c4dff' }}
                >
                  {isAnalyzing ? 'Analyzing...' : '🤖 AI Auto-Categorize'}
                </button>
                <button
                  onClick={() => setShowUnmappedOnly(!showUnmappedOnly)}
                  className={`btn-sm ${showUnmappedOnly ? 'btn-secondary' : 'btn-outline'}`}
                  style={{ fontSize: '0.8rem' }}
                >
                  {showUnmappedOnly ? 'Show All' : 'Filter Unmapped'}
                </button>
              </div>
            </div>
          </div>
          <div className="stat-card" style={{
            flex: 1,
            padding: '1.5rem',
            backgroundColor: 'white',
            borderRadius: '8px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
            borderLeft: '4px solid #4caf50'
          }}>
            <h3 style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>Total Transactions</h3>
            <p style={{ margin: '0.5rem 0 0 0', fontSize: '1.8rem', fontWeight: 'bold', color: '#1a1a1a' }}>{transactions.length}</p>
          </div>
        </div>
      )}

      <div className="transactions-list">
        <div className="list-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>{showUnmappedOnly ? 'Unmapped Transactions' : 'Recent Transactions'}</h2>
          {transactions.length > 0 && (
            <input
              type="text"
              placeholder="Search transactions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ maxWidth: '300px', margin: 0 }}
            />
          )}
        </div>

        {transactions.length === 0 ? (
          <div className="empty-state">
            <p>No transactions yet. Upload a bank statement to get started.</p>
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="empty-state">
            <p>No transactions match your search.</p>
          </div>
        ) : (
          <div className="transactions-table">
            <table>
              <thead>
                <tr>
                  <th onClick={() => handleSort('date')} style={{ cursor: 'pointer' }}>
                    Date {sortConfig?.field === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('description')} style={{ cursor: 'pointer' }}>
                    Description {sortConfig?.field === 'description' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('mappedDescription')} style={{ cursor: 'pointer' }}>
                    Mapped To {sortConfig?.field === 'mappedDescription' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('categoryName')} style={{ cursor: 'pointer' }}>
                    Category {sortConfig?.field === 'categoryName' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('amount')} style={{ cursor: 'pointer' }}>
                    Amount {sortConfig?.field === 'amount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((transaction) => (
                  <tr key={transaction.id}>
                    <td>{format(transaction.date, 'dd MMM yyyy')}</td>
                    <td>
                      <div className="description-cell">
                        <span className="original-desc">{transaction.description}</span>
                        {transaction.mappedDescription && transaction.mappedDescription !== transaction.description && (
                          <span className="mapped-desc">→ {transaction.mappedDescription}</span>
                        )}
                        {transaction.suggestedMerchant && !transaction.mappedDescription && (
                          <span className="mapped-desc" style={{ color: '#7c4dff' }}>
                            ✨ {transaction.suggestedMerchant}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>{transaction.mappedDescription || transaction.suggestedMerchant || '-'}</td>
                    <td>
                      {transaction.categoryName ? (
                        <span className="category-badge">{transaction.categoryName}</span>
                      ) : transaction.suggestedCategoryName ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span className="category-badge" style={{ backgroundColor: '#EDE7F6', color: '#512DA8', border: '1px solid #D1C4E9' }}>
                            ✨ {transaction.suggestedCategoryName}
                          </span>
                          <div className="action-buttons" style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => acceptSuggestion(transaction)} className="btn-icon-sm" title="Accept" style={{ color: 'green', background: 'none', border: 'none', cursor: 'pointer' }}>✓</button>
                            <button onClick={() => rejectSuggestion(transaction)} className="btn-icon-sm" title="Reject" style={{ color: 'red', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ) : (
                        <span className="unmapped">Unmapped</span>
                      )}
                    </td>
                    <td className={transaction.amount < 0 ? 'negative' : 'positive'}>
                      R {Math.abs(transaction.amount).toFixed(2)}
                    </td>
                    <td>
                      <button
                        onClick={() => {
                          setSelectedTransaction(transaction)
                          setShowMapping(true)
                        }}
                        className="btn-outline btn-sm"
                      >
                        Map
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showMapping && selectedTransaction && (
        <div className="mapping-modal">
          <div className="mapping-modal-content">
            <h2>Map Transaction</h2>
            <div className="mapping-info">
              <p><strong>Full Description:</strong> {selectedTransaction.description}</p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                const formData = new FormData(e.currentTarget)
                const categoryId = formData.get('categoryId') as string
                const mappedDesc = (formData.get('mappedDescription') as string) || selectedTransaction.description

                handleMapTransaction(selectedTransaction, categoryId, mappedDesc, matchRuleInput, saveRule, updateSimilar)
              }}
            >
              <div className="form-group">
                <label htmlFor="matchRule">Text to Match (Rule)</label>
                <input
                  id="matchRule"
                  name="matchRule"
                  type="text"
                  value={matchRuleInput}
                  onChange={(e) => setMatchRuleInput(e.target.value)}
                  placeholder="e.g. MUGG & BEAN"
                  required
                />
              </div>

              <div className="form-group checkbox-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={saveRule}
                    onChange={(e) => setSaveRule(e.target.checked)}
                  />
                  <span>Save this rule for future uploads</span>
                </label>
              </div>

              <div className="form-group checkbox-group">
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={updateSimilar}
                    onChange={(e) => setUpdateSimilar(e.target.checked)}
                  />
                  <span>Also update {similarCount} other similar transactions</span>
                </label>
              </div>

              <div className="form-group">
                <label htmlFor="mappedDescription">Mapped Description (Clean Name)</label>
                <input
                  id="mappedDescription"
                  name="mappedDescription"
                  type="text"
                  defaultValue={selectedTransaction.mappedDescription || selectedTransaction.description}
                  placeholder="e.g., Mug and Bean"
                />
              </div>
              <div className="form-group">
                <label htmlFor="categoryId">Category</label>
                <select id="categoryId" name="categoryId" required defaultValue={selectedTransaction.categoryId || ""}>
                  <option value="">Select a category</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-actions">
                <button type="submit" className="btn-primary">
                  Save Mapping
                </button>
                <button
                  type="button"
                  className="btn-outline"
                  onClick={() => {
                    setShowMapping(false)
                    setSelectedTransaction(null)
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showAIReview && (
        <div className="mapping-modal">
          <div className="mapping-modal-content" style={{ maxWidth: '900px', width: '90%', maxHeight: '90vh', overflowY: 'auto' }}>
            <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '1rem' }}>AI Proposed Rules</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              Based on your unmapped transactions, here are some suggested rules.
              <br />
              Approve a rule to automatically map all current and future matching transactions.
            </p>

            <div className="review-table-container">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #eee', color: '#888', textAlign: 'left' }}>
                    <th style={{ padding: '8px' }}>Rule (Match Text)</th>
                    <th style={{ padding: '8px' }}>Clean Name</th>
                    <th style={{ padding: '8px' }}>Category</th>
                    <th style={{ padding: '8px', textAlign: 'center' }}>Matches</th>
                    <th style={{ padding: '8px' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {proposedRules.length === 0 ? (
                    <tr>
                      <td colSpan={5} style={{ padding: '2rem', textAlign: 'center', color: '#888' }}>
                        No rules could be generated. Try analyzing more transactions.
                      </td>
                    </tr>
                  ) : proposedRules.map(rule => (
                    <React.Fragment key={rule.id}>
                      <tr style={{ borderBottom: '1px solid #fcfcfc', backgroundColor: viewingRuleMatches === rule.id ? '#f5f5f5' : 'white' }}>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="text"
                            value={rule.matchText}
                            style={{
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              width: '100%',
                              fontWeight: 500
                            }}
                            onChange={(e) => {
                              const newMatch = e.target.value
                              setProposedRules(prev => prev.map(r => r.id === rule.id ? { ...r, matchText: newMatch } : r))
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <input
                            type="text"
                            value={rule.cleanName}
                            style={{
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              padding: '4px 8px',
                              width: '100%',
                              color: '#7c4dff',
                              fontWeight: 500
                            }}
                            onChange={(e) => {
                              const newName = e.target.value
                              setProposedRules(prev => prev.map(r => r.id === rule.id ? { ...r, cleanName: newName } : r))
                            }}
                          />
                        </td>
                        <td style={{ padding: '8px' }}>
                          <select
                            value={rule.categoryId}
                            onChange={(e) => {
                              const newCatId = e.target.value
                              const newCatName = categories.find(c => c.id === newCatId)?.name || 'Unknown'
                              setProposedRules(prev => prev.map(r => r.id === rule.id ? { ...r, categoryId: newCatId, categoryName: newCatName } : r))
                            }}
                            style={{
                              border: '1px solid #ddd',
                              borderRadius: '4px',
                              padding: '4px',
                              width: '100%',
                              fontSize: '0.9rem'
                            }}
                          >
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'center' }}>
                          <button
                            onClick={() => setViewingRuleMatches(viewingRuleMatches === rule.id ? null : rule.id)}
                            style={{ background: 'none', border: 'none', color: '#2196f3', cursor: 'pointer', textDecoration: 'underline' }}
                          >
                            {rule.affectedTransactionIds.length} txs
                          </button>
                        </td>
                        <td style={{ padding: '8px' }}>
                          <button
                            onClick={() => handleSaveRule(rule)}
                            className="btn-sm btn-primary"
                            style={{ padding: '4px 12px' }}
                          >
                            Approve Rule
                          </button>
                        </td>
                      </tr>
                      {viewingRuleMatches === rule.id && (
                        <tr>
                          <td colSpan={5} style={{ padding: '0 1rem 1rem 1rem', backgroundColor: '#f5f5f5' }}>
                            <div style={{ maxHeight: '200px', overflowY: 'auto', background: 'white', padding: '10px', borderRadius: '4px', border: '1px solid #ddd' }}>
                              <strong>Matching Transactions:</strong>
                              <ul style={{ margin: '0.5rem 0', paddingLeft: '1.5rem', fontSize: '0.85rem' }}>
                                {rule.affectedTransactionIds.map(tid => {
                                  const t = transactions.find(tr => tr.id === tid)
                                  if (!t) return null
                                  return (
                                    <li key={tid} style={{ marginBottom: '4px' }}>
                                      <span style={{ color: '#666' }}>{format(t.date, 'dd MMM')}</span> - {t.description}
                                      <span style={{ float: 'right' }}>R {Math.abs(t.amount).toFixed(2)}</span>
                                    </li>
                                  )
                                })}
                              </ul>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="form-actions" style={{
              marginTop: '1.5rem',
              borderTop: '1px solid #eee',
              paddingTop: '1rem',
              position: 'sticky',
              bottom: -20,
              background: 'white',
              zIndex: 10
            }}>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowAIReview(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

