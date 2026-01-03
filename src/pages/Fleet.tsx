import { useState, useEffect } from 'react'
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './LifeDetails.css' // Reuse styles

interface Vehicle {
    id: string
    name: string
    registrationNumber: string
    licenseExpiry: string // YYYY-MM-DD
}

export default function Fleet() {
    const { currentUser } = useAuth()
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)

    // Form
    const [name, setName] = useState('')
    const [registration, setRegistration] = useState('')
    const [expiry, setExpiry] = useState('')

    useEffect(() => {
        if (!currentUser) return

        const q = query(collection(db, 'fleet'), where('userId', '==', currentUser.uid))
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const items: Vehicle[] = []
                snapshot.forEach((doc) => {
                    items.push({ id: doc.id, ...doc.data() } as Vehicle)
                })
                setVehicles(items)
                setLoading(false)
            },
            (err) => {
                console.error("Error fetching fleet:", err)
                setLoading(false)
                alert("Error loading fleet: " + err.message)
            }
        )

        return () => unsubscribe()
    }, [currentUser])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser) return

        try {
            await addDoc(collection(db, 'fleet'), {
                userId: currentUser.uid,
                name,
                registrationNumber: registration,
                licenseExpiry: expiry,
                createdAt: new Date()
            })
            setShowForm(false)
            setName('')
            setRegistration('')
            setExpiry('')
        } catch (error) {
            console.error('Error adding vehicle:', error)
        }
    }

    async function handleDelete(id: string) {
        if (confirm('Delete vehicle?')) {
            await deleteDoc(doc(db, 'fleet', id))
        }
    }

    // Check for expiries
    const isExpiringSoon = (dateStr: string) => {
        const today = new Date()
        const exp = new Date(dateStr)
        const diffTime = exp.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        return diffDays < 30 // Warning if < 30 days
    }

    const isExpired = (dateStr: string) => {
        const today = new Date()
        const exp = new Date(dateStr)
        return exp < today
    }

    if (loading) return <div className="loading">Loading fleet...</div>

    return (
        <div className="details-container">
            <div className="details-header">
                <h1>My Fleet</h1>
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? 'Cancel' : '+ Add Vehicle'}
                </button>
            </div>

            {showForm && (
                <div className="detail-form-card">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Vehicle Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Silver Toyota" />
                        </div>
                        <div className="form-group">
                            <label>Registration Number</label>
                            <input type="text" value={registration} onChange={e => setRegistration(e.target.value)} required />
                        </div>
                        <div className="form-group">
                            <label>License Expiry Date</label>
                            <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} required />
                        </div>
                        <button type="submit" className="btn-primary">Save Vehicle</button>
                    </form>
                </div>
            )}

            <div className="details-grid">
                {vehicles.map(v => {
                    const expired = isExpired(v.licenseExpiry)
                    const warning = !expired && isExpiringSoon(v.licenseExpiry)

                    return (
                        <div key={v.id} className="category-card" style={{ borderColor: expired ? '#ef4444' : warning ? '#f59e0b' : 'var(--border-color)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                                <h3 style={{ margin: 0, border: 'none' }}>{v.name}</h3>
                                <button className="btn-icon" onClick={() => handleDelete(v.id)}>🗑️</button>
                            </div>

                            <div className="detail-info" style={{ gap: '0.5rem' }}>
                                <div className="detail-row">
                                    <span className="detail-label">Reg:</span>
                                    <span className="detail-value">{v.registrationNumber}</span>
                                </div>
                                <div className="detail-row">
                                    <span className="detail-label">License Expiry:</span>
                                    <span className="detail-value" style={{
                                        color: expired ? '#ef4444' : warning ? '#f59e0b' : 'inherit',
                                        fontWeight: (expired || warning) ? 'bold' : 'normal'
                                    }}>
                                        {v.licenseExpiry}
                                        {expired && " (EXPIRED)"}
                                        {warning && " (Expiring Soon)"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                })}
                {vehicles.length === 0 && !showForm && (
                    <div className="empty-state">No vehicles added yet.</div>
                )}
            </div>
        </div>
    )
}
