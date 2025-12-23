import { useEffect, useState } from 'react'
import { collection, query, where, getDocs, addDoc, updateDoc, orderBy, Timestamp, writeBatch, doc } from 'firebase/firestore'
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



interface BankStatement {
  id: string
  fileName: string
  uploadedAt: Date
  transactionCount: number
}

export default function Transactions() {
  const { currentUser } = useAuth()
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [statements, setStatements] = useState<BankStatement[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [selectedStatement, setSelectedStatement] = useState<string | null>(null)
  const [showMapping, setShowMapping] = useState(false)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([])
  const [showUnmappedOnly, setShowUnmappedOnly] = useState(false)

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

          defaults.forEach((name: string) => {
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

    try {
      const text = await file.text()
      const result = Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
      })

      if (result.errors.length > 0) {
        alert('Error parsing CSV file. Please check the format.')
        return
      }

      // Create bank statement record
      const statementRef = await addDoc(collection(db, 'bankStatements'), {
        userId: currentUser.uid,
        fileName: file.name,
        uploadedAt: new Date(),
        transactionCount: result.data.length,
      })

      // 1. Pre-fetch all mappings
      const mappingSnapshot = await getDocs(collection(db, 'transactionMappings'))
      const mappings: Array<{ rule: string; mappedDescription: string; categoryId: string }> = []

      mappingSnapshot.forEach(doc => {
        const data = doc.data()
        if (data.originalDescription) {
          mappings.push({
            rule: normalizeMatchText(data.originalDescription), // Normalize the rule stored
            mappedDescription: data.mappedDescription,
            categoryId: data.categoryId
          })
        }
      })

      // Sort by length desc so specific rules match before generic ones
      mappings.sort((a, b) => b.rule.length - a.rule.length)

      // Process transactions
      const transactionsToAdd: Omit<Transaction, 'id'>[] = []

      for (const row of result.data as any[]) {
        const keys = Object.keys(row)
        const normalize = (k: string) => k.trim().toLowerCase()

        // robust key finding
        const dateKey = keys.find(k => normalize(k) === 'date') || keys.find(k => normalize(k).includes('date'))
        const descKey = keys.find(k => normalize(k).startsWith('description')) || keys.find(k => normalize(k).includes('details'))
        const debitsKey = keys.find(k => normalize(k) === 'debits') || keys.find(k => normalize(k).includes('debit'))
        const creditsKey = keys.find(k => normalize(k) === 'credits') || keys.find(k => normalize(k).includes('credit'))

        if (!dateKey || !descKey || (!debitsKey && !creditsKey)) {
          // ensure we skip completely empty rows or summary rows
          if (!dateKey && !descKey) continue

          if (!dateKey || !descKey) {
            console.warn('Skipping row - missing necessary columns:', row)
            continue
          }
        }

        const dateStr = row[dateKey!]
        const descStr = row[descKey!]

        // Parse numbers
        let debitVal = 0
        let creditVal = 0

        if (debitsKey && row[debitsKey]) {
          debitVal = parseFloat(String(row[debitsKey]).replace(/[^\d.-]/g, ''))
        }
        if (creditsKey && row[creditsKey]) {
          creditVal = parseFloat(String(row[creditsKey]).replace(/[^\d.-]/g, ''))
        }

        if (isNaN(debitVal) && isNaN(creditVal)) continue

        const amount = (Math.abs(creditVal || 0) - Math.abs(debitVal || 0))
        const date = new Date(dateStr)
        const description = String(descStr || '').trim()

        if (isNaN(date.getTime()) || !description) {
          continue
        }

        // 2. Rule-based lookup (Contains match with normalization)
        let mappedDescription = description
        let categoryId: string | undefined

        const normalizedDesc = normalizeMatchText(description)

        // Find the first rule that matches
        const match = mappings.find(m => normalizedDesc.includes(m.rule))

        if (match) {
          mappedDescription = match.mappedDescription || description
          categoryId = match.categoryId
        }

        // Construct object specifically to avoid undefined values which Firestore rejects
        const newTrans: any = {
          date,
          description,
          amount,
          mappedDescription,
          userId: currentUser.uid,
          bankStatementId: statementRef.id,
        }

        // Only add categoryId if it exists (is not undefined/null/empty)
        if (categoryId) {
          newTrans.categoryId = categoryId
        }

        transactionsToAdd.push(newTrans)
      }

      if (transactionsToAdd.length === 0) {
        throw new Error('No valid transactions found in the file. Please check column headers (Date, Description, Debits, Credits).')
      }

      // Batch add transactions (max 500 per batch)
      const batchSize = 500
      const total = transactionsToAdd.length
      let processed = 0

      for (let i = 0; i < total; i += batchSize) {
        const batch = writeBatch(db)
        const chunk = transactionsToAdd.slice(i, i + batchSize)

        chunk.forEach((trans) => {
          const newDocRef = doc(collection(db, 'transactions'))
          batch.set(newDocRef, {
            ...trans,
            date: Timestamp.fromDate(trans.date),
          })
        })

        await batch.commit()
        processed += chunk.length
        setUploadProgress(Math.round((processed / total) * 100))
      }

      alert(`Successfully imported ${transactionsToAdd.length} transactions`)
      loadTransactions()
    } catch (error: any) {
      console.error('Error uploading file:', error)
      alert(`Failed to upload file: ${error.message || 'Unknown error'}`)
    } finally {
      setUploading(false)
      setUploadProgress(0)
      e.target.value = ''
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
        const mappingQuery = query(
          collection(db, 'transactionMappings'),
          where('originalDescription', '==', matchRule)
        )
        const mappingSnapshot = await getDocs(mappingQuery)

        if (!mappingSnapshot.empty) {
          await updateDoc(mappingSnapshot.docs[0].ref, {
            mappedDescription: mappedDesc,
            categoryId: finalCategoryId,
            updatedAt: new Date(),
          })
        } else {
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

  const filteredTransactions = transactions.filter(transaction => {
    const search = searchTerm.toLowerCase()
    const matchesSearch = (
      transaction.description.toLowerCase().includes(search) ||
      (transaction.mappedDescription || '').toLowerCase().includes(search) ||
      (transaction.categoryName || '').toLowerCase().includes(search)
    )
    const matchesUnmapped = showUnmappedOnly ? !transaction.categoryId : true

    return matchesSearch && matchesUnmapped
  })

  const unmappedCount = transactions.filter(t => !t.categoryId).length

  // Modal State
  const [matchRuleInput, setMatchRuleInput] = useState('')
  const [saveRule, setSaveRule] = useState(true)
  const [updateSimilar, setUpdateSimilar] = useState(true)

  // AI Review State
  const [showAIReview, setShowAIReview] = useState(false)
  const [selectedReviewIds, setSelectedReviewIds] = useState<Set<string>>(new Set())
  const [selectedRuleIds, setSelectedRuleIds] = useState<Set<string>>(new Set())

  // Reset modal state when opening
  useEffect(() => {
    if (selectedTransaction) {
      setMatchRuleInput(selectedTransaction.description)
      setSaveRule(true)
      setUpdateSimilar(true)
    }
  }, [selectedTransaction])

  // Reset selection when review modal opens
  useEffect(() => {
    if (showAIReview) {
      const suggestions = transactions.filter(t => t.suggestedCategory)
      const allIds = new Set(suggestions.map(t => t.id as string))
      setSelectedReviewIds(allIds)
      setSelectedRuleIds(allIds) // Default to saving rules for all
    }
  }, [showAIReview, transactions])

  const similarCount = transactions.filter(t =>
    selectedTransaction &&
    t.id !== selectedTransaction.id &&
    normalizeMatchText(t.description).includes(normalizeMatchText(matchRuleInput))
  ).length

  async function handleBulkApprove() {
    if (selectedReviewIds.size === 0) return

    const batch = writeBatch(db)
    let count = 0
    let ruleCount = 0
    const processedRules = new Set<string>() // To avoid duplicate rules in this batch

    // Approve selected
    for (const id of Array.from(selectedReviewIds)) {
      const t = transactions.find(trans => trans.id === id)
      if (t && t.suggestedCategory) {
        const ref = doc(db, 'transactions', id)
        batch.update(ref, {
          categoryId: t.suggestedCategory,
          categoryName: t.suggestedCategoryName,
          mappedDescription: t.suggestedMerchant || t.mappedDescription || t.description,
          suggestedCategory: null,
          suggestedCategoryName: null,
          suggestedMerchant: null
        })
        count++

        // Handle Save Rule
        if (selectedRuleIds.has(id) && t.suggestedMerchant) {
          const ruleText = normalizeMatchText(t.suggestedMerchant)

          // Only save unique rules per batch
          if (!processedRules.has(ruleText)) {
            processedRules.add(ruleText)

            const ruleRef = doc(collection(db, 'transactionMappings'))
            batch.set(ruleRef, {
              originalDescription: t.suggestedMerchant, // The Match Rule
              mappedDescription: t.suggestedMerchant,   // The Clean Name
              categoryId: t.suggestedCategory,
              userId: currentUser!.uid,
              createdAt: new Date(),
              updatedAt: new Date(),
              source: 'ai_auto'
            })
            ruleCount++
          }
        }
      }
    }

    // Reject unselected (Clear suggestions)
    const unselected = transactions.filter(t => t.suggestedCategory && !selectedReviewIds.has(t.id as string))
    unselected.forEach(t => {
      if (t.id) {
        const ref = doc(db, 'transactions', t.id)
        batch.update(ref, {
          suggestedCategory: null,
          suggestedCategoryName: null,
          suggestedMerchant: null
        })
      }
    })

    try {
      await batch.commit()
      setShowAIReview(false)
      loadTransactions()
      alert(`Approved ${count} transactions and saved ${ruleCount} new rules.`)
    } catch (e) {
      console.error("Error bulk approving", e)
      alert("Failed to approve mappings")
    }
  }

  function toggleRuleSelection(id: string) {
    const newSet = new Set(selectedRuleIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedRuleIds(newSet)
  }

  function toggleCategoryRules(catName: string, ids: string[]) {
    const newSet = new Set(selectedRuleIds)
    const allSelected = ids.every(id => newSet.has(id))

    if (allSelected) {
      ids.forEach(id => newSet.delete(id))
    } else {
      ids.forEach(id => newSet.add(id))
    }
    setSelectedRuleIds(newSet)
  }

  function toggleReviewSelection(id: string) {
    const newSet = new Set(selectedReviewIds)
    if (newSet.has(id)) {
      newSet.delete(id)
    } else {
      newSet.add(id)
    }
    setSelectedReviewIds(newSet)
  }

  function toggleCategorySelection(catName: string, ids: string[]) {
    const newSet = new Set(selectedReviewIds)
    const allSelected = ids.every(id => newSet.has(id))

    if (allSelected) {
      ids.forEach(id => newSet.delete(id))
    } else {
      ids.forEach(id => newSet.add(id))
    }
    setSelectedReviewIds(newSet)
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
      <div className="transactions-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>Transactions</h1>
          <p>Upload bank statements and map transactions to budget categories</p>
        </div>
        <label className="file-upload-label" style={{ marginTop: '0.5rem' }}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <span className="btn-primary">
            {uploading ? 'Uploading...' : 'Upload CSV'}
          </span>
        </label>
      </div>

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
              <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                  <th>Date</th>
                  <th>Description</th>
                  <th>Mapped To</th>
                  <th>Category</th>
                  <th>Amount</th>
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
            <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '1rem', marginBottom: '1rem' }}>AI Auto-Categorize Review</h2>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              Review the AI's suggestions below. Uncheck any you want to reject.
              <br />
              <strong>Save Rule:</strong> check this to automatically categorize similar transactions in future uploads.
            </p>

            <div className="review-table-container">
              {Object.entries(
                transactions
                  .filter(t => t.suggestedCategory)
                  .reduce((acc, t) => {
                    const cat = t.suggestedCategoryName || 'Uncategorized';
                    if (!acc[cat]) acc[cat] = [];
                    acc[cat].push(t);
                    return acc;
                  }, {} as Record<string, Transaction[]>)
              ).sort((a, b) => a[0].localeCompare(b[0])).map(([category, items]) => {
                const allSelected = items.every(i => selectedReviewIds.has(i.id!));
                const allRulesSelected = items.every(i => selectedRuleIds.has(i.id!));

                return (
                  <div key={category} style={{ marginBottom: '2rem' }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      background: '#f8f9fa',
                      padding: '0.75rem',
                      borderRadius: '6px',
                      marginBottom: '0.5rem',
                      fontWeight: 'bold',
                      borderLeft: '4px solid #7c4dff'
                    }}>
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => toggleCategorySelection(category, items.map(i => i.id!))}
                        title="Approve All in Category"
                        style={{ width: '18px', height: '18px', marginRight: '10px', cursor: 'pointer' }}
                      />
                      <span>{category}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 'normal', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={allRulesSelected}
                            onChange={() => toggleCategoryRules(category, items.map(i => i.id!))}
                          />
                          Save all rules
                        </label>
                        <span style={{ fontSize: '0.8rem', color: '#666', background: 'white', padding: '2px 8px', borderRadius: '12px' }}>
                          {items.length} items
                        </span>
                      </div>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #eee', color: '#888', textAlign: 'left' }}>
                          <th style={{ padding: '8px', width: '40px' }} title="Approve">Appr.</th>
                          <th style={{ padding: '8px', width: '40px' }} title="Save Rule">Rule</th>
                          <th style={{ padding: '8px' }}>Date</th>
                          <th style={{ padding: '8px' }}>Original Description</th>
                          <th style={{ padding: '8px' }}>Suggested Merchant / Clean Name</th>
                          <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(t => (
                          <tr key={t.id} style={{ borderBottom: '1px solid #fcfcfc' }}>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="checkbox"
                                checked={selectedReviewIds.has(t.id!)}
                                onChange={() => toggleReviewSelection(t.id!)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '8px' }}>
                              <input
                                type="checkbox"
                                checked={selectedRuleIds.has(t.id!)}
                                onChange={() => toggleRuleSelection(t.id!)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                              />
                            </td>
                            <td style={{ padding: '8px', color: '#666' }}>{format(t.date, 'dd MMM')}</td>
                            <td style={{ padding: '8px' }}>{t.description}</td>
                            <td style={{ padding: '8px', color: '#7c4dff', fontWeight: 500 }}>
                              {t.suggestedMerchant}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>
                              R {Math.abs(t.amount).toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
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
              <div style={{ flex: 1, color: '#666' }}>
                {selectedReviewIds.size} transactions will be approved. <br />
                {selectedRuleIds.size} new mapping rules will be saved.
              </div>
              <button
                onClick={handleBulkApprove}
                className="btn-primary"
                style={{ backgroundColor: '#7c4dff' }}
              >
                Approve & Save Rules
              </button>
              <button
                type="button"
                className="btn-outline"
                onClick={() => setShowAIReview(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div >
  )
}

