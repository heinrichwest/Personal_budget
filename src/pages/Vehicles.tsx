import { useState, useEffect } from 'react'
import { Step } from 'react-joyride'
import PageTour from '../components/PageTour'
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './LifeDetails.css' // Recycle similar layout styles

interface Vehicle {
    id: string
    userId: string
    registrationNumber: string
    vinNumber: string
    makeModel: string
    licenseExpiry: string
    serviceHistory?: string
    notes?: string
    photoUrl?: string; // New field
    photoPath?: string; // New field
}

export default function Vehicles() {
    const { currentUser } = useAuth()
    const [vehicles, setVehicles] = useState<Vehicle[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null) // New: Tracks which vehicle is being edited
    const [uploading, setUploading] = useState(false) // New: Tracks upload status

    // Form
    const [regNum, setRegNum] = useState('')
    const [vinNum, setVinNum] = useState('')
    const [makeModel, setMakeModel] = useState('')
    const [licenseExpiry, setLicenseExpiry] = useState('')
    const [notes, setNotes] = useState('')
    const [photoFile, setPhotoFile] = useState<File | null>(null) // New: Holds photo file

    useEffect(() => {
        if (!currentUser) return

        const q = query(collection(db, 'vehicles'), where('userId', '==', currentUser.uid))
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const items: Vehicle[] = []
            snapshot.forEach((doc) => {
                items.push({ id: doc.id, ...doc.data() } as Vehicle)
            })
            setVehicles(items)
            setLoading(false)
        }, (error) => {
            console.error("Error fetching vehicles:", error)
            setLoading(false)
        })

        return () => unsubscribe()
    }, [currentUser])

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser) return

        setUploading(true)
        try {
            let photoUrl = editingId ? (vehicles.find(v => v.id === editingId)?.photoUrl || '') : ''
            let photoPath = editingId ? (vehicles.find(v => v.id === editingId)?.photoPath || '') : ''

            // Upload Photo if new file selected
            if (photoFile) {
                // Generate a new path. Warning: If replacing, we aren't deleting the old one here to be safe, but ideally should.
                photoPath = `users/${currentUser.uid}/vehicles/${Date.now()}_${photoFile.name}`
                const photoRef = ref(storage, photoPath)
                await uploadBytes(photoRef, photoFile)
                photoUrl = await getDownloadURL(photoRef)
            }

            const vehicleData = {
                userId: currentUser.uid,
                registrationNumber: regNum,
                vinNumber: vinNum,
                makeModel: makeModel,
                licenseExpiry: licenseExpiry,
                notes: notes,
                photoUrl,
                photoPath,
                createdAt: editingId ? undefined : new Date()
            }

            if (editingId) {
                // Update existing
                delete vehicleData.createdAt; // Don't update createdAt
                await updateDoc(doc(db, 'vehicles', editingId), vehicleData)
            } else {
                // Create new
                await addDoc(collection(db, 'vehicles'), vehicleData)
            }

            setShowForm(false)
            resetForm()
        } catch (error: any) {
            console.error("Error saving vehicle:", error)
            alert("Failed to save vehicle: " + error.message)
        } finally {
            setUploading(false)
        }
    }

    function handleEdit(vehicle: Vehicle) {
        setEditingId(vehicle.id)
        setRegNum(vehicle.registrationNumber)
        setVinNum(vehicle.vinNumber)
        setMakeModel(vehicle.makeModel)
        setLicenseExpiry(vehicle.licenseExpiry)
        setNotes(vehicle.notes || '')
        setPhotoFile(null)
        setShowForm(true)
        // Scroll to form
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    function resetForm() {
        setEditingId(null)
        setRegNum('')
        setVinNum('')
        setMakeModel('')
        setLicenseExpiry('')
        setNotes('')
        setPhotoFile(null)
    }

    async function handleDelete(vehicle: Vehicle) {
        if (confirm("Delete this vehicle?")) {
            try {
                if (vehicle.photoPath) {
                    await deleteObject(ref(storage, vehicle.photoPath)).catch(console.warn)
                }
                await deleteDoc(doc(db, 'vehicles', vehicle.id))
            } catch (e: any) {
                console.error("Delete failed", e)
                alert("Failed to delete: " + e.message)
            }
        }
    }

    // Logic: Warning if expiry date is within next 30 days
    const getExpiryStatus = (dateStr: string) => {
        if (!dateStr) return { status: 'ok', label: '' }

        const today = new Date()
        const exp = new Date(dateStr)
        // Set hours to ignore time components
        today.setHours(0, 0, 0, 0)
        exp.setHours(0, 0, 0, 0)

        const diffTime = exp.getTime() - today.getTime()
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (diffDays < 0) return { status: 'expired', label: 'Expired', color: '#ef4444' }
        if (diffDays <= 30) return { status: 'warning', label: `Expiring in ${diffDays} days`, color: '#f59e0b' }
        return { status: 'ok', label: 'Valid', color: '#10b981' }
    }

    if (loading) return <div className="loading">Loading vehicles...</div>

    const tourSteps: Step[] = [
        {
            target: 'body',
            content: 'Manage your vehicle fleet here. Track registration numbers, license expiries, and service notes.',
            placement: 'center',
        },
        {
            target: '.details-header button',
            content: 'Click here to add a vehicle. You can upload photos to help identify them easily.',
        },
        {
            target: '.details-grid-column',
            content: 'Your vehicles will appear here. We highlight expiring licenses automatically.',
        },
    ]

    return (
        <div className="details-container">
            <PageTour pageId="vehicles" steps={tourSteps} />
            <div className="details-header">
                <h1>My Vehicles</h1>
                <button className="btn-primary" onClick={() => {
                    if (showForm) resetForm();
                    setShowForm(!showForm)
                }}>
                    {showForm ? 'Cancel' : '+ Add Vehicle'}
                </button>
            </div>

            {showForm && (
                <div className="detail-form-card">
                    <h3 style={{ marginBottom: '1rem' }}>{editingId ? 'Edit Vehicle' : 'New Vehicle'}</h3>
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label>Vehicle Make & Model</label>
                            <input type="text" required placeholder="e.g. Toyota Hilux 2.8"
                                value={makeModel} onChange={e => setMakeModel(e.target.value)} />
                        </div>
                        <div className="form-group-row">
                            <div className="form-group">
                                <label>Registration Number</label>
                                <input type="text" required placeholder="ABC 123 GP"
                                    value={regNum} onChange={e => setRegNum(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>VIN Number</label>
                                <input type="text" placeholder="17 digit VIN"
                                    value={vinNum} onChange={e => setVinNum(e.target.value)} />
                            </div>
                        </div>
                        <div className="form-group">
                            <label>License Disk Expiry Date</label>
                            <input type="date" required
                                value={licenseExpiry} onChange={e => setLicenseExpiry(e.target.value)} />
                        </div>
                        <div className="form-group">
                            <label>Vehicle Photo</label>
                            <input type="file" onChange={e => setPhotoFile(e.target.files ? e.target.files[0] : null)} accept="image/*" />
                            {editingId && vehicles.find(v => v.id === editingId)?.photoUrl && (
                                <div style={{ fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                    Current: <a href={vehicles.find(v => v.id === editingId)?.photoUrl} target="_blank">View Photo</a>
                                </div>
                            )}
                        </div>
                        <div className="form-group">
                            <label>Notes</label>
                            <textarea placeholder="Service intervals, tire sizes, etc."
                                value={notes} onChange={e => setNotes(e.target.value)} />
                        </div>
                        <button type="submit" className="btn-primary" disabled={uploading}>
                            {uploading ? 'Saving...' : (editingId ? 'Update Vehicle' : 'Save Vehicle')}
                        </button>
                    </form>
                </div>
            )}

            <div className="details-grid-column">
                {vehicles.map(v => {
                    const status = getExpiryStatus(v.licenseExpiry)
                    return (
                        <div key={v.id} className="vehicle-row-card" style={{ borderLeft: `4px solid ${status.color}`, padding: '1rem', background: 'var(--card-bg)', borderRadius: '8px', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                            <div className="vehicle-info" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                {/* Photo Thumbnail */}
                                {v.photoUrl && (
                                    <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0 }}>
                                        <img src={v.photoUrl} alt="Vehicle" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    </div>
                                )}
                                <div>
                                    <h3 style={{ margin: '0 0 0.5rem 0' }}>{v.makeModel}</h3>
                                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                        <div><strong>Reg:</strong> {v.registrationNumber}</div>
                                        <div><strong>VIN:</strong> {v.vinNumber || 'N/A'}</div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <strong>License Expiry:</strong> {v.licenseExpiry}
                                            {status.status !== 'ok' && (
                                                <span style={{
                                                    backgroundColor: status.color,
                                                    color: 'white',
                                                    padding: '2px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '0.75rem',
                                                    fontWeight: 'bold'
                                                }}>
                                                    {status.label}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {v.notes && <div style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '0.85rem' }}>"{v.notes}"</div>}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn-icon" onClick={() => handleEdit(v)} title="Edit">✏️</button>
                                <button className="btn-icon" onClick={() => handleDelete(v)} title="Delete">🗑️</button>
                            </div>
                        </div>
                    )
                })}
                {vehicles.length === 0 && <div className="empty-state">No vehicles added yet.</div>}
            </div>
        </div>
    )
}
