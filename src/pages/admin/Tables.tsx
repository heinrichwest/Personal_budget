import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useAuth } from '../../contexts/AuthContext'

interface CollectionData {
  id: string
  [key: string]: any
}

interface UserMap {
  [userId: string]: string // userId -> email/displayName
}

const COLLECTIONS = [
  'users',
  'userRoles',
  'budgets',
  'transactions',
  'transactionMappings',
  'bankStatements',
  'systemConfig'
]

export default function Tables() {
  const { isSystemAdmin } = useAuth()
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null)
  const [data, setData] = useState<CollectionData[]>([])
  const [filteredData, setFilteredData] = useState<CollectionData[]>([])
  const [loading, setLoading] = useState(false)
  const [columns, setColumns] = useState<string[]>([])
  const [userMap, setUserMap] = useState<UserMap>({})
  const [filterText, setFilterText] = useState('')
  const [filterColumn, setFilterColumn] = useState<string>('all')

  // Load users map on mount for username lookups
  useEffect(() => {
    loadUserMap()
  }, [])

  useEffect(() => {
    if (selectedCollection) {
      loadCollectionData(selectedCollection)
    }
  }, [selectedCollection])

  // Apply filter when data or filter changes
  useEffect(() => {
    if (!filterText.trim()) {
      setFilteredData(data)
      return
    }

    const searchText = filterText.toLowerCase()
    const filtered = data.filter(row => {
      if (filterColumn === 'all') {
        // Search all columns
        return columns.some(col => {
          const value = formatValue(row[col], col)
          return value.toLowerCase().includes(searchText)
        })
      } else {
        // Search specific column
        const value = formatValue(row[filterColumn], filterColumn)
        return value.toLowerCase().includes(searchText)
      }
    })
    setFilteredData(filtered)
  }, [data, filterText, filterColumn, columns])

  async function loadUserMap() {
    try {
      const snapshot = await getDocs(collection(db, 'users'))
      const map: UserMap = {}
      snapshot.forEach(doc => {
        const userData = doc.data()
        map[doc.id] = userData.email || userData.displayName || doc.id
      })
      setUserMap(map)
    } catch (error) {
      console.error('Error loading users:', error)
    }
  }

  async function loadCollectionData(collectionName: string) {
    setLoading(true)
    try {
      const snapshot = await getDocs(collection(db, collectionName))
      const docs: CollectionData[] = []
      const allKeys = new Set<string>(['id'])

      snapshot.forEach(doc => {
        const docData = doc.data()
        const docWithId: CollectionData = { id: doc.id, ...docData }

        // Add resolved userName if userId exists
        if (docData.userId && docData.userId !== 'SYSTEM') {
          docWithId['_userName'] = userMap[docData.userId] || docData.userId
        } else if (docData.userId === 'SYSTEM') {
          docWithId['_userName'] = 'SYSTEM'
        }

        docs.push(docWithId)

        // Collect all keys for columns
        Object.keys(docData).forEach(key => allKeys.add(key))
      })

      // Add _userName to columns if any document has userId
      if (docs.some(d => d.userId)) {
        allKeys.add('_userName')
      }

      // Sort columns: id first, _userName second, then alphabetically
      const sortedColumns = Array.from(allKeys).sort((a, b) => {
        if (a === 'id') return -1
        if (b === 'id') return 1
        if (a === '_userName') return -1
        if (b === '_userName') return 1
        return a.localeCompare(b)
      })

      setColumns(sortedColumns)
      setData(docs)
      setFilteredData(docs)
      setFilterText('')
      setFilterColumn('all')
    } catch (error) {
      console.error('Error loading collection:', error)
      setData([])
      setColumns([])
    } finally {
      setLoading(false)
    }
  }

  function formatValue(value: any, columnName?: string): string {
    if (value === null || value === undefined) {
      return '—'
    }
    if (typeof value === 'boolean') {
      return value ? 'true' : 'false'
    }
    if (value?.toDate) {
      // Firestore Timestamp
      return value.toDate().toLocaleString()
    }
    if (value instanceof Date) {
      return value.toLocaleString()
    }
    if (typeof value === 'object') {
      return JSON.stringify(value)
    }

    // Convert userId to username if applicable
    const strValue = String(value)
    if (columnName && (columnName === 'userId' || columnName === 'createdBy' || columnName === 'updatedBy')) {
      if (strValue === 'SYSTEM') {
        return 'SYSTEM'
      }
      const username = userMap[strValue]
      if (username) {
        return username
      }
    }

    return strValue
  }

  if (!isSystemAdmin) {
    return (
      <div className="container" style={{ padding: '2rem' }}>
        <h1>Access Denied</h1>
        <p>This page is only accessible to system administrators.</p>
      </div>
    )
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '100%', width: '100%', boxSizing: 'border-box' }}>
      <h1 style={{ marginBottom: '1.5rem', color: '#12265e' }}>Firebase Collections</h1>

      {/* Collection Selector */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        marginBottom: '1.5rem',
        padding: '1rem',
        backgroundColor: '#f5f7fa',
        borderRadius: '8px'
      }}>
        {COLLECTIONS.map(col => (
          <button
            key={col}
            onClick={() => setSelectedCollection(col)}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: '4px',
              border: selectedCollection === col ? '2px solid #12265e' : '2px solid #ccc',
              backgroundColor: selectedCollection === col ? '#12265e' : 'white',
              color: selectedCollection === col ? 'white' : '#333',
              cursor: 'pointer',
              fontWeight: selectedCollection === col ? '600' : '400',
              transition: 'all 0.2s ease'
            }}
          >
            {col}
          </button>
        ))}
      </div>

      {/* Data Table */}
      {selectedCollection && (
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <h2 style={{ margin: 0, color: '#12265e' }}>
              {selectedCollection}
              <span style={{
                marginLeft: '1rem',
                fontSize: '0.9rem',
                color: '#666',
                fontWeight: 'normal'
              }}>
                ({filteredData.length}{filterText ? ` of ${data.length}` : ''} documents)
              </span>
            </h2>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={filterColumn}
                onChange={(e) => setFilterColumn(e.target.value)}
                style={{
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  backgroundColor: 'white',
                  color: '#333',
                  cursor: 'pointer'
                }}
              >
                <option value="all">All Columns</option>
                {columns.map(col => (
                  <option key={col} value={col}>{col === '_userName' ? 'User Name' : col}</option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Filter..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  width: '200px'
                }}
              />
              {filterText && (
                <button
                  onClick={() => setFilterText('')}
                  style={{
                    padding: '0.5rem 0.75rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                    backgroundColor: 'white',
                    color: '#666',
                    cursor: 'pointer'
                  }}
                >
                  Clear
                </button>
              )}
              <button
                onClick={() => loadCollectionData(selectedCollection)}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  border: '1px solid #12265e',
                  backgroundColor: 'white',
                  color: '#12265e',
                  cursor: 'pointer'
                }}
              >
                Refresh
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : data.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              No documents found in this collection.
            </div>
          ) : filteredData.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              No documents match the filter.
            </div>
          ) : (
            <div style={{
              overflow: 'auto',
              maxHeight: 'calc(100vh - 350px)',
              maxWidth: '100%',
              WebkitOverflowScrolling: 'touch'
            }}>
              <table style={{
                minWidth: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.85rem',
                tableLayout: 'auto'
              }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 10 }}>
                  <tr style={{ backgroundColor: '#f5f7fa' }}>
                    {columns.map(col => (
                      <th
                        key={col}
                        style={{
                          padding: '0.75rem 1rem',
                          textAlign: 'left',
                          borderBottom: '2px solid #12265e',
                          whiteSpace: 'nowrap',
                          color: '#12265e',
                          fontWeight: '600',
                          backgroundColor: '#f5f7fa'
                        }}
                      >
                        {col === '_userName' ? 'User Name' : col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredData.map((row, idx) => (
                    <tr
                      key={row.id}
                      style={{
                        backgroundColor: idx % 2 === 0 ? 'white' : '#fafafa',
                        borderBottom: '1px solid #eee'
                      }}
                    >
                      {columns.map(col => (
                        <td
                          key={col}
                          style={{
                            padding: '0.75rem 1rem',
                            maxWidth: '300px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={formatValue(row[col], col)}
                        >
                          {formatValue(row[col], col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!selectedCollection && (
        <div style={{
          padding: '3rem',
          textAlign: 'center',
          color: '#666',
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <p style={{ fontSize: '1.1rem' }}>Select a collection above to view its data.</p>
        </div>
      )}
    </div>
  )
}
