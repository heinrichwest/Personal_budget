import { useState, useEffect } from 'react'
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './LifeDetails.css' // Reuse styles

interface Asset {
    id: string
    name: string
    purchaseDate: string
    warrantyExpiry: string
    value: number
    slipUrl?: string
    slipPath?: string
    notes?: string
}

export default function Assets() {
    const { currentUser } = useAuth()
    const [assets, setAssets] = useState<Asset[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [uploading, setUploading] = useState(false)

    // Form
    const [name, setName] = useState('')
    const [purchaseDate, setPurchaseDate] = useState('')
    const [warrantyExpiry, setWarrantyExpiry] = useState('')
    const [value, setValue] = useState('')
    const [notes, setNotes] = useState('')
    const [file, setFile] = useState<File | null>(null)

    useEffect(() => {
        if (!currentUser) return

        const q = query(collection(db, 'assets'), where('userId', '==', currentUser.uid))
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const items: Asset[] = []
                snapshot.forEach((doc) => {
                    items.push({ id: doc.id, ...doc.data() } as Asset)
                })
                setAssets(items)
                setLoading(false)
            },
            (err) => {
                console.error("Error fetching assets:", err)
                setLoading(false)
                alert("Error loading assets: " + err.message)
            }
        )

        return () => unsubscribe()
    }, [currentUser])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser) return

        setUploading(true)
        try {
            let downloadUrl = ''
            let storagePath = ''

            if (file) {
                storagePath = `users/${currentUser.uid}/assets/${Date.now()}_${file.name}`
                const storageRef = ref(storage, storagePath)
                await uploadBytes(storageRef, file)
                downloadUrl = await getDownloadURL(storageRef)
            }

            await addDoc(collection(db, 'assets'), {
                userId: currentUser.uid,
                name,
                purchaseDate,
                warrantyExpiry,
                value: parseFloat(value) || 0,
                notes,
                slipUrl: downloadUrl,
                slipPath: storagePath,
                createdAt: new Date()
            })

            setShowForm(false)
            resetForm()
        } catch (error) {
            console.error('Error adding asset:', error)
            alert('Failed to add asset.')
        } finally {
            setUploading(false)
        }
    }

    function resetForm() {
        setName('')
        setPurchaseDate('')
        setWarrantyExpiry('')
        setValue('')
        setNotes('')
        setFile(null)
    }

    async function handleDelete(asset: Asset) {
        if (!confirm('Delete this asset?')) return

        try {
            if (asset.slipPath) {
                const storageRef = ref(storage, asset.slipPath)
                await deleteObject(storageRef).catch(e => console.warn("Storage delete failed", e))
            }
            await deleteDoc(doc(db, 'assets', asset.id))
        } catch (error) {
            console.error('Error deleting:', error)
        }
    }

    const isWarrantyExpiring = (dateStr: string) => {
        if (!dateStr) return false
        const today = new Date()
        const exp = new Date(dateStr)
        const diffTime = exp.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return diffDays > 0 && diffDays < 60 // Warning if < 60 days left
    }

    const isWarrantyExpired = (dateStr: string) => {
        if (!dateStr) return false
        const today = new Date()
        const exp = new Date(dateStr)
        return exp < today
    }

    if (loading) return <div className="loading">Loading assets...</div>

    return (
        <div className="details-container">
            <div className="details-header">
                <h1>My Assets</h1>
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? 'Cancel' : '+ Add Asset'}
                </button>
            </div>

            {showForm && (
                <div className="detail-form-card">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Asset Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. MacBook Pro M3" />
                        </div>
                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Purchase Date</label>
                                <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required />
                            </div>
                            <div className="form-group">
                                <label>Warranty Expiry</label>
                                <input type="date" value={warrantyExpiry} onChange={e => setWarrantyExpiry(e.target.value)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>Value (R)</label>
                            <input type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} required placeholder="0.00" />
                        </div>
                        <div className="form-group">
                            <label>Upload Slip/Screenshot</label>
                            <input type="file" onChange={e => setFile(e.target.files ? e.target.files[0] : null)} accept="image/*,.pdf" />
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} />
                        </div>
                        <button type="submit" className="btn-primary" disabled={uploading}>
                            {uploading ? 'Saving...' : 'Save Asset'}
                        </button>
                    </form>
                </div>
            )}

            <div className="details-grid">
                {assets.map(asset => {
                    const expired = isWarrantyExpired(asset.warrantyExpiry)
                    const warning = !expired && isWarrantyExpiring(asset.warrantyExpiry)

                    return (
                        <div key={asset.id} className="category-card asset-card" style={{ borderColor: warning ? '#f59e0b' : expired ? 'var(--border-color)' : 'var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                <h3>{asset.name}</h3>
                                <button className="btn-icon" onClick={() => handleDelete(asset)}>🗑️</button>
                            </div>

                            <div className="detail-info">
                                <div className="asset-meta">Purchased: {asset.purchaseDate || 'N/A'}</div>
                                <div className="asset-value">R {asset.value.toFixed(2)}</div>

                                {asset.warrantyExpiry && (
                                    <div className="detail-row" style={{ marginTop: '0.5rem' }}>
                                        <span className="detail-label">Warranty:</span>
                                        <span className="detail-value" style={{
                                            color: expired ? '#ef4444' : warning ? '#f59e0b' : 'inherit',
                                            fontWeight: (expired || warning) ? 'bold' : 'normal'
                                        }}>
                                            {asset.warrantyExpiry}
                                            {expired && " (Expired)"}
                                            {warning && " (Expiring Soon)"}
                                        </span>
                                    </div>
                                )}

                                {asset.slipUrl && (
                                    <a href={asset.slipUrl} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm" style={{ marginTop: '1rem', width: '100%', textAlign: 'center' }}>
                                        View Slip
                                    </a>
                                )}
                            </div>
                        </div>
                    )
                })}
                {assets.length === 0 && !showForm && (
                    <div className="empty-state">No assets added yet.</div>
                )}
            </div>
        </div>
    )
}
