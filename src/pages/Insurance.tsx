import { useState, useEffect } from 'react'
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './LifeDetails.css'

interface Policy {
    id: string
    category: string
    label: string // Provider / Name
    value: string // Policy Number / Reference
    notes?: string
    userId: string
    docUrl?: string
    docPath?: string
}

interface Asset {
    id: string
    name: string
    make?: string
    serialNumber?: string
    value: number
    isInsured: boolean
    // ... other fields present in Asset schema but we only need these for display
}

export default function Insurance() {
    const { currentUser } = useAuth()
    const [activeTab, setActiveTab] = useState('Policies')
    const [loading, setLoading] = useState(true)

    // Data
    const [policies, setPolicies] = useState<Policy[]>([])
    const [insuredAssets, setInsuredAssets] = useState<Asset[]>([])

    // Form
    const [editingPolicy, setEditingPolicy] = useState<Partial<Policy> | null>(null)
    const [policyFile, setPolicyFile] = useState<File | null>(null)
    const [uploading, setUploading] = useState(false)

    useEffect(() => {
        if (!currentUser) return

        // 1. Fetch Policies
        const qPolicies = query(collection(db, 'lifeDetails'), where('userId', '==', currentUser.uid))
        const unsubPolicies = onSnapshot(qPolicies, (snapshot) => {
            const items: Policy[] = []
            snapshot.forEach((doc) => {
                const data = doc.data()
                if (data.category === 'Global_Policy' || data.category === 'Insurance') {
                    items.push({ id: doc.id, ...data } as Policy)
                }
            })
            setPolicies(items)
        })

        // 2. Fetch Insured Assets
        const qAssets = query(collection(db, 'assets'), where('userId', '==', currentUser.uid), where('isInsured', '==', true))
        const unsubAssets = onSnapshot(qAssets, (snapshot) => {
            const items: Asset[] = []
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as Asset)
            })
            setInsuredAssets(items)
            setLoading(false)
        })

        return () => {
            unsubPolicies()
            unsubAssets()
        }
    }, [currentUser])

    async function handleSavePolicy(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser || !editingPolicy) return
        setUploading(true)

        try {
            let downloadUrl = editingPolicy.docUrl || ''
            let storagePath = editingPolicy.docPath || ''

            if (policyFile) {
                storagePath = `users/${currentUser.uid}/insurance_docs/${Date.now()}_${policyFile.name}`
                const storageRef = ref(storage, storagePath)
                await uploadBytes(storageRef, policyFile)
                downloadUrl = await getDownloadURL(storageRef)
            }

            const policyData = {
                label: editingPolicy.label,
                value: editingPolicy.value,
                notes: editingPolicy.notes || '',
                category: 'Global_Policy',
                userId: currentUser.uid,
                docUrl: downloadUrl,
                docPath: storagePath,
                createdAt: new Date()
            }

            if (editingPolicy.id) {
                const { createdAt, ...updateData } = policyData
                await updateDoc(doc(db, 'lifeDetails', editingPolicy.id), updateData)
            } else {
                await addDoc(collection(db, 'lifeDetails'), policyData)
            }
            setEditingPolicy(null)
            setPolicyFile(null)
        } catch (error) {
            console.error("Error saving policy:", error)
        } finally {
            setUploading(false)
        }
    }

    async function handleDeletePolicy(policy: Policy) {
        if (!confirm("Delete this policy?")) return
        try {
            if (policy.docPath) {
                await deleteObject(ref(storage, policy.docPath)).catch(console.warn)
            }
            await deleteDoc(doc(db, 'lifeDetails', policy.id))
        } catch (e) {
            console.error("Delete failed", e)
        }
    }

    if (loading) return <div className="loading">Loading insurance data...</div>

    return (
        <div className="details-container">
            <div className="details-header">
                <h1>My Insurance</h1>
            </div>

            <div className="tabs-nav">
                <button className={`tab-btn ${activeTab === 'Policies' ? 'active' : ''}`} onClick={() => setActiveTab('Policies')}>Policies</button>
                <button className={`tab-btn ${activeTab === 'Assets' ? 'active' : ''}`} onClick={() => setActiveTab('Assets')}>Insured Assets</button>
            </div>

            <div className="tab-container">
                {activeTab === 'Policies' && (
                    <div className="tab-content fade-in">
                        <div className="section-header">
                            <h3>Active Policies</h3>
                            <button className="btn-primary" onClick={() => setEditingPolicy({ label: '', value: '' })}>+ Add Policy</button>
                        </div>

                        <div className="grid-cards-compact">
                            {policies.map(item => (
                                <div key={item.id} className="info-card" style={{ borderColor: 'var(--border-color)', position: 'relative' }}>
                                    <div className="info-label">{item.label}</div>
                                    <div className="info-value">{item.value}</div>
                                    {item.notes && <div className="info-notes">{item.notes}</div>}

                                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'center' }}>
                                        {item.docUrl && (
                                            <a href={item.docUrl} target="_blank" className="btn-outline btn-sm" style={{ flex: 1, textAlign: 'center' }}>
                                                Document
                                            </a>
                                        )}
                                        <button className="btn-outline btn-sm" style={{ flex: 1 }} onClick={() => setEditingPolicy(item)}>
                                            Edit
                                        </button>
                                    </div>

                                    <button className="del-btn-corner" onClick={() => handleDeletePolicy(item)}>×</button>
                                </div>
                            ))}
                            {policies.length === 0 && <div className="empty-state-text">No policies added yet.</div>}
                        </div>
                    </div>
                )}

                {activeTab === 'Assets' && (
                    <div className="tab-content fade-in">
                        <div className="section-header">
                            <h3>Insured Assets (From My Assets)</h3>
                        </div>

                        <div className="table-container">
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Asset Name</th>
                                        <th>Make</th>
                                        <th>Serial Number</th>
                                        <th>Value</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {insuredAssets.map(asset => (
                                        <tr key={asset.id}>
                                            <td style={{ fontWeight: 500 }}>{asset.name}</td>
                                            <td>{asset.make || '-'}</td>
                                            <td className="text-muted small">{asset.serialNumber || '-'}</td>
                                            <td>R {asset.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td><span className="badge badge-success">Insured</span></td>
                                        </tr>
                                    ))}
                                    {insuredAssets.length === 0 && (
                                        <tr>
                                            <td colSpan={5} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                                                No assets marked as insured. Go to "My Assets" to add them.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal */}
            {editingPolicy && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>{editingPolicy.id ? 'Edit Policy' : 'Add Policy'}</h3>
                        <form onSubmit={handleSavePolicy}>
                            <div className="form-group">
                                <label>Insurer / Provider</label>
                                <input type="text" placeholder="e.g. Discovery Life" required
                                    value={editingPolicy.label}
                                    onChange={e => setEditingPolicy({ ...editingPolicy, label: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Description / Policy Number</label>
                                <input type="text" required
                                    value={editingPolicy.value}
                                    onChange={e => setEditingPolicy({ ...editingPolicy, value: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Upload Policy Document</label>
                                <input type="file" onChange={e => setPolicyFile(e.target.files ? e.target.files[0] : null)} accept=".pdf,image/*" />
                                {editingPolicy.docUrl && <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>Current: <a href={editingPolicy.docUrl} target="_blank">View</a></div>}
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea placeholder="Premiums, contact info..."
                                    value={editingPolicy.notes || ''}
                                    onChange={e => setEditingPolicy({ ...editingPolicy, notes: e.target.value })}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-outline" onClick={() => setEditingPolicy(null)}>Cancel</button>
                                <button type="submit" className="btn-primary" disabled={uploading}>
                                    {uploading ? 'Uploading...' : 'Save'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
