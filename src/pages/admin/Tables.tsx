import { useEffect, useState } from 'react'
import { collection, getDocs } from 'firebase/firestore'
import { db } from '../../config/firebase'
import { useAuth } from '../../contexts/AuthContext'

interface CollectionData {
  id: string
  [key: string]: any
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
  const [loading, setLoading] = useState(false)
  const [columns, setColumns] = useState<string[]>([])

  useEffect(() => {
    if (selectedCollection) {
      loadCollectionData(selectedCollection)
    }
  }, [selectedCollection])

  async function loadCollectionData(collectionName: string) {
    setLoading(true)
    try {
      const snapshot = await getDocs(collection(db, collectionName))
      const docs: CollectionData[] = []
      const allKeys = new Set<string>(['id'])

      snapshot.forEach(doc => {
        const docData = doc.data()
        docs.push({ id: doc.id, ...docData })

        // Collect all keys for columns
        Object.keys(docData).forEach(key => allKeys.add(key))
      })

      // Sort columns: id first, then alphabetically
      const sortedColumns = Array.from(allKeys).sort((a, b) => {
        if (a === 'id') return -1
        if (b === 'id') return 1
        return a.localeCompare(b)
      })

      setColumns(sortedColumns)
      setData(docs)
    } catch (error) {
      console.error('Error loading collection:', error)
      setData([])
      setColumns([])
    } finally {
      setLoading(false)
    }
  }

  function formatValue(value: any): string {
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
    return String(value)
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
    <div className="container" style={{ padding: '2rem', maxWidth: '100%' }}>
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
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '1rem',
            borderBottom: '1px solid #eee',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h2 style={{ margin: 0, color: '#12265e' }}>
              {selectedCollection}
              <span style={{
                marginLeft: '1rem',
                fontSize: '0.9rem',
                color: '#666',
                fontWeight: 'normal'
              }}>
                ({data.length} documents)
              </span>
            </h2>
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

          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center' }}>Loading...</div>
          ) : data.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
              No documents found in this collection.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.85rem'
              }}>
                <thead>
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
                          fontWeight: '600'
                        }}
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, idx) => (
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
                          title={formatValue(row[col])}
                        >
                          {formatValue(row[col])}
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
