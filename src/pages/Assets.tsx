import { useState, useEffect } from 'react'
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './LifeDetails.css' // Reuse styles

interface Asset {
    id: string
    name: string
    category: string // User defined
    make?: string
    serialNumber?: string
    purchaseDate: string
    warrantyExpiry: string
    value: number
    isInsured: boolean
    slipUrl?: string
    slipPath?: string
    photoUrl?: string
    photoPath?: string
    notes?: string
}

export default function Assets() {
    const { currentUser } = useAuth()
    const [assets, setAssets] = useState<Asset[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)

    // Form
    const [name, setName] = useState('')
    const [category, setCategory] = useState('')
    const [make, setMake] = useState('')
    const [serialNumber, setSerialNumber] = useState('')
    const [purchaseDate, setPurchaseDate] = useState('')
    const [warrantyExpiry, setWarrantyExpiry] = useState('')
    const [value, setValue] = useState('')
    const [isInsured, setIsInsured] = useState(false)
    const [notes, setNotes] = useState('')

    // Files
    const [slipFile, setSlipFile] = useState<File | null>(null)
    const [photoFile, setPhotoFile] = useState<File | null>(null)

    // Tabs
    const [activeTab, setActiveTab] = useState('All')

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
            }
        )

        return () => unsubscribe()
    }, [currentUser])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser) return

        setUploading(true)
        try {
            let slipUrl = editingId ? (assets.find(a => a.id === editingId)?.slipUrl || '') : ''
            let slipPath = editingId ? (assets.find(a => a.id === editingId)?.slipPath || '') : ''
            let photoUrl = editingId ? (assets.find(a => a.id === editingId)?.photoUrl || '') : ''
            let photoPath = editingId ? (assets.find(a => a.id === editingId)?.photoPath || '') : ''

            // Upload Slip if new file selected
            if (slipFile) {
                // If editing and has old file, maybe delete old one? Ignoring for simplicity/safety
                slipPath = `users/${currentUser.uid}/assets/slips/${Date.now()}_${slipFile.name}`
                const slipRef = ref(storage, slipPath)
                await uploadBytes(slipRef, slipFile)
                slipUrl = await getDownloadURL(slipRef)
            }

            // Upload Photo if new file selected
            if (photoFile) {
                photoPath = `users/${currentUser.uid}/assets/photos/${Date.now()}_${photoFile.name}`
                const photoRef = ref(storage, photoPath)
                await uploadBytes(photoRef, photoFile)
                photoUrl = await getDownloadURL(photoRef)
            }

            const finalCategory = category || 'Uncategorized'

            const assetData = {
                userId: currentUser.uid,
                name,
                category: finalCategory,
                make,
                serialNumber,
                purchaseDate,
                warrantyExpiry,
                value: parseFloat(value) || 0,
                isInsured,
                notes,
                slipUrl,
                slipPath,
                photoUrl,
                photoPath,
                createdAt: editingId ? undefined : new Date() // Don't overwrite created date on edit
            }

            // Remove undefined fields
            if (editingId) {
                delete assetData.createdAt
                await updateDoc(doc(db, 'assets', editingId), assetData)
            } else {
                await addDoc(collection(db, 'assets'), assetData)
            }

            setShowForm(false)
            resetForm()
        } catch (error: any) {
            console.error('Error saving asset:', error)
            alert('Failed to save asset: ' + error.message)
        } finally {
            setUploading(false)
        }
    }

    function handleEdit(asset: Asset) {
        setEditingId(asset.id)
        setName(asset.name)
        setCategory(asset.category)
        setMake(asset.make || '')
        setSerialNumber(asset.serialNumber || '')
        setPurchaseDate(asset.purchaseDate || '')
        setWarrantyExpiry(asset.warrantyExpiry || '')
        setValue(asset.value.toString())
        setIsInsured(asset.isInsured)
        setNotes(asset.notes || '')
        setSlipFile(null)
        setPhotoFile(null)
        setShowForm(true)

        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    function resetForm() {
        setEditingId(null)
        setName('')
        setCategory('')
        setMake('')
        setSerialNumber('')
        setPurchaseDate('')
        setWarrantyExpiry('')
        setValue('')
        setIsInsured(false)
        setNotes('')
        setSlipFile(null)
        setPhotoFile(null)
    }

    async function handleDelete(asset: Asset) {
        if (!confirm('Delete this asset?')) return

        try {
            if (asset.slipPath) await deleteObject(ref(storage, asset.slipPath)).catch(console.warn)
            if (asset.photoPath) await deleteObject(ref(storage, asset.photoPath)).catch(console.warn)
            await deleteDoc(doc(db, 'assets', asset.id))
        } catch (error) {
            console.error('Error deleting:', error)
        }
    }

    // Helper: Get unique categories
    const categories = Array.from(new Set(assets.map(a => a.category || 'Uncategorized')))
    categories.sort()

    // Filter Assets based on Tab
    const filteredAssets = activeTab === 'All'
        ? assets
        : assets.filter(a => (a.category || 'Uncategorized') === activeTab)

    if (loading) return <div className="loading">Loading assets...</div>

    return (
        <div className="details-container">
            <div className="details-header">
                <h1>My Assets</h1>
                <button className="btn-primary" onClick={() => {
                    if (showForm) resetForm()
                    setShowForm(!showForm)
                }}>
                    {showForm ? 'Cancel' : '+ Add Asset'}
                </button>
            </div>

            {showForm && (
                <div className="detail-form-card">
                    <h3 style={{ marginBottom: '1rem' }}>{editingId ? 'Edit Asset' : 'New Asset'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Asset Name</label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. MacBook Pro" />
                            </div>
                            <div className="form-group">
                                <label>Category</label>
                                <input
                                    type="text"
                                    list="category-suggestions"
                                    value={category}
                                    onChange={e => setCategory(e.target.value)}
                                    placeholder="Select or Type New..."
                                    required
                                />
                                <datalist id="category-suggestions">
                                    {categories.map(c => <option key={c} value={c} />)}
                                </datalist>
                            </div>
                        </div>

                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Make / Brand</label>
                                <input type="text" value={make} onChange={e => setMake(e.target.value)} placeholder="e.g. Apple, Samsung" />
                            </div>
                            <div className="form-group">
                                <label>Serial Number</label>
                                <input type="text" value={serialNumber} onChange={e => setSerialNumber(e.target.value)} />
                            </div>
                        </div>

                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Purchase Date</label>
                                <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Warranty Expiry</label>
                                <input type="date" value={warrantyExpiry} onChange={e => setWarrantyExpiry(e.target.value)} />
                            </div>
                        </div>

                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Value (R)</label>
                                <input type="number" step="0.01" value={value} onChange={e => setValue(e.target.value)} required placeholder="0.00" />
                            </div>
                            <div className="form-group checkbox-group" style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: '10px' }}>
                                <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={isInsured}
                                        onChange={e => setIsInsured(e.target.checked)}
                                        style={{ width: 'auto', marginRight: '0.5rem' }}
                                    />
                                    Is Asset Insured?
                                </label>
                            </div>
                        </div>

                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Upload Slip (PDF/Image)</label>
                                <input type="file" onChange={e => setSlipFile(e.target.files ? e.target.files[0] : null)} accept="image/*,.pdf" />
                                {editingId && assets.find(a => a.id === editingId)?.slipUrl && (
                                    <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                        Current: <a href={assets.find(a => a.id === editingId)?.slipUrl} target="_blank">View Slip</a>
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label>Upload Photo</label>
                                <input type="file" onChange={e => setPhotoFile(e.target.files ? e.target.files[0] : null)} accept="image/*" />
                                {editingId && assets.find(a => a.id === editingId)?.photoUrl && (
                                    <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                        Current: <a href={assets.find(a => a.id === editingId)?.photoUrl} target="_blank">View Photo</a>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Description / Notes</label>
                            <textarea value={notes} onChange={e => setNotes(e.target.value)} />
                        </div>

                        <button type="submit" className="btn-primary" disabled={uploading}>
                            {uploading ? 'Saving...' : (editingId ? 'Update Asset' : 'Save Asset')}
                        </button>
                    </form>
                </div>
            )}

            {/* Asset Tabs */}
            <div className="tabs-nav" style={{ marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <button
                    className={`tab-btn ${activeTab === 'All' ? 'active' : ''}`}
                    onClick={() => setActiveTab('All')}
                >
                    All Assets
                </button>
                {categories.map(c => (
                    <button
                        key={c}
                        className={`tab-btn ${activeTab === c ? 'active' : ''}`}
                        onClick={() => setActiveTab(c)}
                    >
                        {c}
                    </button>
                ))}
            </div>

            <div className="table-container fade-in">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>Asset Name</th>
                            <th>Category</th>
                            <th>Make & Serial</th>
                            <th>Purchase Date</th>
                            <th>Value</th>
                            <th>Warranty</th>
                            <th>Insured</th>
                            <th>Docs</th>
                            <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredAssets.map(asset => {
                            const expired = asset.warrantyExpiry && new Date(asset.warrantyExpiry) < new Date()
                            return (
                                <tr key={asset.id}>
                                    <td>
                                        <div style={{ fontWeight: 500 }}>{asset.name}</div>
                                        {asset.notes && <div className="text-muted small">{asset.notes}</div>}
                                    </td>
                                    <td>{asset.category}</td>
                                    <td>
                                        <div>{asset.make || '-'}</div>
                                        <div className="text-muted small">{asset.serialNumber}</div>
                                    </td>
                                    <td>{asset.purchaseDate || '-'}</td>
                                    <td className="text-nowrap">R {asset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td style={{ color: expired ? '#ef4444' : 'inherit' }}>
                                        {asset.warrantyExpiry || '-'}
                                        {expired && <span className="badge badge-danger" style={{ marginLeft: '5px' }}>Exp</span>}
                                    </td>
                                    <td>
                                        {asset.isInsured ? <span className="badge badge-success">Yes</span> : <span style={{ color: '#9ca3af' }}>No</span>}
                                    </td>
                                    <td>
                                        <div style={{ display: 'flex', gap: '5px' }}>
                                            {asset.slipUrl && <a href={asset.slipUrl} target="_blank" title="Slip">📄</a>}
                                            {asset.photoUrl && <a href={asset.photoUrl} target="_blank" title="Photo">🖼️</a>}
                                        </div>
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="btn-icon" onClick={() => handleEdit(asset)} title="Edit" style={{ marginRight: '0.5rem' }}>✏️</button>
                                        <button className="btn-icon" onClick={() => handleDelete(asset)} title="Delete">🗑️</button>
                                    </td>
                                </tr>
                            )
                        })}
                        {filteredAssets.length === 0 && (
                            <tr>
                                <td colSpan={9} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                                    No assets found in this category.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
