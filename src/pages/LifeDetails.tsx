import { useState, useEffect } from 'react'
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { ref, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './LifeDetails.css'

// Interfaces
interface FamilyMember {
    id: string
    name: string
    relationship: string
    photoUrl?: string
    photoPath?: string
    // New Fields
    idNumber?: string
    allergies?: string
    medicalConditions?: string // "Other Medical Information"
    medicalHistory?: string
}

interface SicknessRecord {
    id: string
    memberId: string
    sicknessName: string
    startDate: string
    endDate?: string
    recoveryDuration?: string
    medicationUsed: string
    notes?: string
    dateRecorded: any
}

interface OperationRecord {
    id: string
    memberId: string
    operationName: string
    date: string
    doctor: string
    hospital: string
    notes: string
    userId: string
    createdAt: any
}

interface LifeDetail {
    id: string
    memberId?: string
    category: string
    label: string
    value: string
    notes?: string
}

export default function LifeDetails() {
    const { currentUser } = useAuth()
    const [loading, setLoading] = useState(true)

    // Data
    const [members, setMembers] = useState<FamilyMember[]>([])
    const [details, setDetails] = useState<LifeDetail[]>([])
    const [sicknessLogs, setSicknessLogs] = useState<SicknessRecord[]>([])
    const [operations, setOperations] = useState<OperationRecord[]>([])

    // UI State
    const [activeMember, setActiveMember] = useState<FamilyMember | null>(null)
    const [showMemberForm, setShowMemberForm] = useState(false)
    const [showSicknessForm, setShowSicknessForm] = useState(false)
    const [showOpForm, setShowOpForm] = useState(false)

    // Member Form State
    const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
    const [memName, setMemName] = useState('')
    const [memRel, setMemRel] = useState('')
    const [memIdNum, setMemIdNum] = useState('')
    const [memAllergies, setMemAllergies] = useState('')
    const [memConditions, setMemConditions] = useState('')
    const [memHistory, setMemHistory] = useState('')
    // Photo disabled
    const [uploading, setUploading] = useState(false)

    // Sickness Form State
    const [sickName, setSickName] = useState('')
    const [sickStart, setSickStart] = useState('')
    const [sickDuration, setSickDuration] = useState('')
    const [sickMeds, setSickMeds] = useState('')
    const [sickNotes, setSickNotes] = useState('')

    // Operation Form State
    const [opName, setOpName] = useState('')
    const [opDate, setOpDate] = useState('')
    const [opDoctor, setOpDoctor] = useState('')
    const [opHospital, setOpHospital] = useState('')
    const [opNotes, setOpNotes] = useState('')

    // Detail Form (Shared)
    const [editingDetail, setEditingDetail] = useState<Partial<LifeDetail> | null>(null)

    useEffect(() => {
        if (!currentUser) return

        // 1. Fetch Family Members
        const qMembers = query(collection(db, 'familyMembers'), where('userId', '==', currentUser.uid))
        const unsubMembers = onSnapshot(qMembers, (snap) => {
            const items: FamilyMember[] = []
            snap.forEach(d => items.push({ id: d.id, ...d.data() } as FamilyMember))
            setMembers(items)
        })

        // 2. Fetch Details (All)
        const qDetails = query(collection(db, 'lifeDetails'), where('userId', '==', currentUser.uid))
        const unsubDetails = onSnapshot(qDetails, (snap) => {
            const items: LifeDetail[] = []
            snap.forEach(d => items.push({ id: d.id, ...d.data() } as LifeDetail))
            setDetails(items)
        })

        // 3. Fetch Sickness Logs (Client-side sort to avoid index issues for now)
        const qSickness = query(collection(db, 'sicknessLogs'), where('userId', '==', currentUser.uid))
        const unsubSickness = onSnapshot(qSickness,
            (snap) => {
                const items: SicknessRecord[] = []
                snap.forEach(d => items.push({ id: d.id, ...d.data() } as SicknessRecord))
                // Sort client-side
                items.sort((a, b) => {
                    const dateA = a.dateRecorded?.seconds ? new Date(a.dateRecorded.seconds * 1000) : new Date(a.dateRecorded) || new Date()
                    const dateB = b.dateRecorded?.seconds ? new Date(b.dateRecorded.seconds * 1000) : new Date(b.dateRecorded) || new Date()
                    return dateB.getTime() - dateA.getTime()
                })
                setSicknessLogs(items)
            },
            (err) => {
                console.error("Error fetching sickness logs:", err)
            }
        )

        // 4. Fetch Operations
        const qOps = query(collection(db, 'medicalOperations'), where('userId', '==', currentUser.uid))
        const unsubOps = onSnapshot(qOps,
            (snap) => {
                const items: OperationRecord[] = []
                snap.forEach(d => items.push({ id: d.id, ...d.data() } as OperationRecord))
                // Sort by date descending
                items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                setOperations(items)
                setLoading(false)
            },
            (error) => {
                console.error("Error fetching operations:", error)
                // Even on error, we should stop loading or we get stuck
                setLoading(false)
            }
        )

        return () => {
            unsubMembers()
            unsubDetails()
            unsubSickness()
            unsubOps()
        }
    }, [currentUser])

    // --- Member Actions ---

    function handleEditMemberClick(member: FamilyMember) {
        console.log("Edit button clicked for:", member)
        setEditingMemberId(member.id)
        setMemName(member.name)
        setMemRel(member.relationship)
        setMemIdNum(member.idNumber || '')
        setMemAllergies(member.allergies || '')
        setMemConditions(member.medicalConditions || '')
        setMemHistory(member.medicalHistory || '')
        setShowMemberForm(true)
        console.log("State updated, opening form...")
    }

    async function handleSaveMember(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser) return
        setUploading(true)

        try {
            const memberData = {
                name: memName,
                relationship: memRel,
                idNumber: memIdNum,
                allergies: memAllergies,
                medicalConditions: memConditions,
                medicalHistory: memHistory,
            }

            if (editingMemberId) {
                // Update
                console.log("Updating member...", editingMemberId)
                await updateDoc(doc(db, 'familyMembers', editingMemberId), memberData)
                // If the updated member is currently active, update the local active state to reflect changes immediately
                if (activeMember?.id === editingMemberId) {
                    setActiveMember(prev => prev ? { ...prev, ...memberData } : null)
                }
            } else {
                // Add New
                console.log("Adding new member...")
                await addDoc(collection(db, 'familyMembers'), {
                    userId: currentUser.uid,
                    ...memberData,
                    photoUrl: '',
                    photoPath: '',
                    createdAt: new Date()
                })
            }

            console.log("Save complete.")
            setShowMemberForm(false)
            resetMemberForm()
        } catch (error: any) {
            console.error("Error saving member:", error)
            alert("Failed to save member: " + (error.message || "Unknown error"))
        } finally {
            setUploading(false)
        }
    }

    function resetMemberForm() {
        setEditingMemberId(null)
        setMemName('')
        setMemRel('')
        setMemIdNum('')
        setMemAllergies('')
        setMemConditions('')
        setMemHistory('')
    }

    async function handleDeleteMember(member: FamilyMember) {
        if (!confirm(`Delete ${member.name} and all their details?`)) return

        try {
            if (member.photoPath) {
                await deleteObject(ref(storage, member.photoPath)).catch(e => console.warn("Photo delete failed", e))
            }
            await deleteDoc(doc(db, 'familyMembers', member.id))

            // Delete Linked Details
            const memberDetails = details.filter(d => d.memberId === member.id)
            for (const d of memberDetails) {
                await deleteDoc(doc(db, 'lifeDetails', d.id))
            }
            // Delete sickness logs
            const memberLogs = sicknessLogs.filter(l => l.memberId === member.id)
            for (const l of memberLogs) {
                await deleteDoc(doc(db, 'sicknessLogs', l.id))
            }

            if (activeMember?.id === member.id) setActiveMember(null)
        } catch (error) {
            console.error("Error deleting member", error)
        }
    }

    // --- Sickness Actions ---

    async function handleAddSickness(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser || !activeMember) return

        try {
            await addDoc(collection(db, 'sicknessLogs'), {
                userId: currentUser.uid,
                memberId: activeMember.id,
                sicknessName: sickName,
                startDate: sickStart,
                recoveryDuration: sickDuration,
                medicationUsed: sickMeds,
                notes: sickNotes,
                dateRecorded: new Date()
            })
            setShowSicknessForm(false)
            setSickName('')
            setSickStart('')
            setSickDuration('')
            setSickMeds('')
            setSickNotes('')
        } catch (error) {
            console.error("Error logging sickness", error)
            alert("Failed to log sickness.")
        }
    }

    async function handleDeleteSickness(id: string) {
        if (confirm("Delete this log?")) await deleteDoc(doc(db, 'sicknessLogs', id))
    }

    // --- Operation Actions ---

    async function handleSaveOperation(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser || !activeMember) return

        try {
            await addDoc(collection(db, 'medicalOperations'), {
                userId: currentUser.uid,
                memberId: activeMember.id,
                operationName: opName,
                date: opDate,
                doctor: opDoctor,
                hospital: opHospital,
                notes: opNotes,
                createdAt: new Date()
            })
            setShowOpForm(false)
            // Reset
            setOpName('')
            setOpDate('')
            setOpDoctor('')
            setOpHospital('')
            setOpNotes('')
        } catch (error: any) {
            console.error("Error saving operation", error)
            alert("Failed to save operation: " + error.message)
        }
    }

    async function handleDeleteOperation(id: string) {
        if (confirm("Delete this operation record?")) {
            await deleteDoc(doc(db, 'medicalOperations', id))
        }
    }

    // --- Detail Actions ---

    async function handleSaveDetail(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser || !editingDetail) return

        try {
            const detailData = {
                label: editingDetail.label,
                value: editingDetail.value,
                notes: editingDetail.notes || '',
                memberId: activeMember ? activeMember.id : null,
                category: editingDetail.category || 'Other',
                userId: currentUser.uid
            }

            if (editingDetail.id) {
                await updateDoc(doc(db, 'lifeDetails', editingDetail.id), {
                    value: detailData.value,
                    notes: detailData.notes
                })
            } else {
                await addDoc(collection(db, 'lifeDetails'), {
                    ...detailData,
                    createdAt: new Date()
                })
            }
            setEditingDetail(null)
        } catch (error) {
            console.error("Error saving detail", error)
        }
    }

    async function handleDeleteDetail(id: string) {
        if (confirm("Delete this info?")) {
            await deleteDoc(doc(db, 'lifeDetails', id))
        }
    }

    // --- Views ---

    if (loading) return <div className="loading">Loading My Life...</div>

    // View: Single Member Details
    if (activeMember) {
        const memberDetails = details.filter(d => d.memberId === activeMember.id)
        const memberSickness = sicknessLogs.filter(l => l.memberId === activeMember.id)
        const memberOperations = operations.filter(o => o.memberId === activeMember.id)

        const categories = ['Identity', 'Medical', 'Other']

        return (
            <div className="details-container">
                <div className="breadcrumbs">
                    <span onClick={() => setActiveMember(null)} className="link-span">My Life</span>
                    <span className="separator">/</span>
                    <span>{activeMember.name}</span>
                </div>

                <div className="member-profile-header">
                    <div className="profile-large-img">
                        {activeMember.photoUrl ? (
                            <img src={activeMember.photoUrl} alt={activeMember.name} />
                        ) : (
                            <div className="placeholder-avatar-lg">{activeMember.name[0]}</div>
                        )}
                    </div>
                    <div className="profile-info">
                        <h1>{activeMember.name}</h1>
                        <div className="badge badge-secondary">{activeMember.relationship}</div>
                        <div style={{ marginTop: '0.5rem', color: '#6B7280' }}>
                            {activeMember.idNumber ? `ID: ${activeMember.idNumber}` : 'No ID Number provided'}
                        </div>
                    </div>
                    <div className="profile-actions-col">
                        <button className="btn-outline btn-sm" onClick={() => handleEditMemberClick(activeMember)}>Edit Profile</button>
                        <button className="btn-outline btn-sm delete-btn" onClick={() => handleDeleteMember(activeMember)}>Delete</button>
                    </div>
                </div>

                {/* 1. PERSONAL DETAILS (Summary) */}
                {/* <div className="section-header"><h3>Personal Information</h3></div> */}
                {/* We already showed the core stuff in the header, let's keep it clean or add a specific card if needed.
                    But user asked for "First Personal Info, Then Medical".
                    The Header acts as Personal Info. Let's make sure we have everything.
                */}

                {/* 2. MEDICAL HISTORY (Profile) */}
                <div className="medical-profile-section" style={{ marginTop: '2rem' }}>
                    <div className="section-header">
                        <h3>Medical Profile</h3>
                        <button className="btn-text" onClick={() => handleEditMemberClick(activeMember)}>Edit Details</button>
                    </div>
                    <div className="medical-info-grid">
                        <div className="med-card">
                            <label>Allergies</label>
                            <div className="med-value">{activeMember.allergies || 'Aucun known allergies'}</div>
                        </div>
                        <div className="med-card">
                            <label>Medical Conditions</label>
                            <div className="med-value">{activeMember.medicalConditions || 'No chronic conditions listed'}</div>
                        </div>
                        <div className="med-card full-width">
                            <label>General Medical History</label>
                            <div className="med-value">{activeMember.medicalHistory || 'No history recorded'}</div>
                        </div>
                    </div>
                </div>

                {/* Operations Section */}
                <div className="section-header" style={{ marginTop: '2rem' }}>
                    <h3>Operations & Surgeries</h3>
                    <button className="btn-primary btn-sm" onClick={() => setShowOpForm(true)}>+ Add Operation</button>
                </div>

                {memberOperations.length === 0 ? (
                    <div className="empty-card-placeholder">
                        <p>No operations recorded.</p>
                        <button className="btn-text" onClick={() => setShowOpForm(true)}>Add Record</button>
                    </div>
                ) : (
                    <div className="operations-list">
                        {memberOperations.map(op => (
                            <div key={op.id} className="operation-card">
                                <div className="op-header">
                                    <h4>{op.operationName}</h4>
                                    <span className="op-date">{op.date}</span>
                                </div>
                                <div className="op-details">
                                    <div className="op-row">
                                        <span className="icon">🏥</span> <span>{op.hospital || 'Hospital not specified'}</span>
                                    </div>
                                    <div className="op-row">
                                        <span className="icon">👨‍⚕️</span> <span>{op.doctor || 'Doctor not specified'}</span>
                                    </div>
                                    {op.notes && <div className="op-notes">"{op.notes}"</div>}
                                </div>
                                <button className="delete-op-btn" onClick={() => handleDeleteOperation(op.id)} title="Delete Record">🗑️</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Sickness History Section */}
                <div className="detail-section" style={{ marginBottom: '2rem', marginTop: '2rem' }}>
                    <div className="section-header">
                        <h3>Sickness History</h3>
                        <button className="btn-text" onClick={() => setShowSicknessForm(true)}>+ Log Sickness</button>
                    </div>
                    <div className="section-list">
                        {memberSickness.map(log => (
                            <div key={log.id} className="sickness-log">
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <h4>{log.sicknessName}</h4>
                                    <button className="btn-icon" onClick={() => handleDeleteSickness(log.id)}>×</button>
                                </div>
                                <div className="sickness-meta">Started: {log.startDate} | Recovery: {log.recoveryDuration}</div>
                                <div><strong>Meds:</strong> {log.medicationUsed}</div>
                                {log.notes && <div><em>{log.notes}</em></div>}
                            </div>
                        ))}
                        {memberSickness.length === 0 && <div className="empty-text">No sickness history recorded.</div>}
                    </div>
                </div>

                {/* Generic Details Section */}
                <div className="details-grid-column">
                    {categories.map(cat => {
                        const catItems = memberDetails.filter(d => d.category === cat)
                        if (cat === 'Medical') return null // Skip Medical here as we showed it above
                        return (
                            <div key={cat} className="detail-section">
                                <div className="section-header">
                                    <h3>{cat === 'Identity' ? 'Other Identity Documents' : `${cat} Details`}</h3>
                                    <button className="btn-text"
                                        onClick={() => setEditingDetail({ category: cat, label: '', value: '' })}>
                                        + Add
                                    </button>
                                </div>
                                <div className="section-list">
                                    {catItems.map(item => (
                                        <div key={item.id} className="detail-row">
                                            <div className="row-content">
                                                <span className="row-label">{item.label}</span>
                                                <span className="row-value">{item.value}</span>
                                                {item.notes && <span className="row-notes">{item.notes}</span>}
                                            </div>
                                            <button className="btn-icon" onClick={() => handleDeleteDetail(item.id)}>×</button>
                                        </div>
                                    ))}
                                    {catItems.length === 0 && <div className="empty-text">No info added.</div>}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Modal for adding info */}
                {editingDetail && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Add {editingDetail.category} Info</h3>
                            <form onSubmit={handleSaveDetail}>
                                <div className="form-group">
                                    <label>Label</label>
                                    <input type="text" placeholder="e.g. ID Number" required
                                        value={editingDetail.label}
                                        onChange={e => setEditingDetail({ ...editingDetail, label: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Value</label>
                                    <input type="text" required
                                        value={editingDetail.value}
                                        onChange={e => setEditingDetail({ ...editingDetail, value: e.target.value })}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Notes</label>
                                    <textarea
                                        value={editingDetail.notes || ''}
                                        onChange={e => setEditingDetail({ ...editingDetail, notes: e.target.value })}
                                    />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-outline" onClick={() => setEditingDetail(null)}>Cancel</button>
                                    <button type="submit" className="btn-primary">Save</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Operation Form Modal */}
                {showOpForm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Add Operation / Surgery</h3>
                            <form onSubmit={handleSaveOperation}>
                                <div className="form-group">
                                    <label>Operation Name</label>
                                    <input type="text" required placeholder="e.g. Appendicitis Removal"
                                        value={opName} onChange={e => setOpName(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Date</label>
                                    <input type="date" required
                                        value={opDate} onChange={e => setOpDate(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Doctor's Name</label>
                                    <input type="text" placeholder="Dr. Smith"
                                        value={opDoctor} onChange={e => setOpDoctor(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Hospital</label>
                                    <input type="text" placeholder="General Hospital"
                                        value={opHospital} onChange={e => setOpHospital(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Comments / Notes</label>
                                    <textarea placeholder="Any complications or successful recovery notes..."
                                        value={opNotes} onChange={e => setOpNotes(e.target.value)} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-outline" onClick={() => setShowOpForm(false)}>Cancel</button>
                                    <button type="submit" className="btn-primary">Save Record</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Sickness Form Modal */}
                {showSicknessForm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>Log Sickness</h3>
                            <form onSubmit={handleAddSickness}>
                                <div className="form-group">
                                    <label>Sickness Name</label>
                                    <input type="text" required placeholder="e.g. Flu, COVID-19" value={sickName} onChange={e => setSickName(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Date Started</label>
                                    <input type="date" required value={sickStart} onChange={e => setSickStart(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Time to Recover (Duration)</label>
                                    <input type="text" placeholder="e.g. 5 days, 2 weeks" value={sickDuration} onChange={e => setSickDuration(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Medication Used (What worked?)</label>
                                    <textarea placeholder="e.g. Panado, Vitamin C" value={sickMeds} onChange={e => setSickMeds(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Notes</label>
                                    <textarea value={sickNotes} onChange={e => setSickNotes(e.target.value)} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-outline" onClick={() => setShowSicknessForm(false)}>Cancel</button>
                                    <button type="submit" className="btn-primary">Log History</button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Member Form Modal (For Editing) */}
                {showMemberForm && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h3>{editingMemberId ? 'Edit Profile' : 'Add Family Member'}</h3>
                            <form onSubmit={handleSaveMember}>
                                <div className="form-group">
                                    <label>Name</label>
                                    <input type="text" required value={memName} onChange={e => setMemName(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Relationship</label>
                                    <input type="text" required placeholder="e.g. Spouse, Son" value={memRel} onChange={e => setMemRel(e.target.value)} />
                                </div>
                                {/* NEW FIELDS */}
                                <div className="form-group">
                                    <label>ID Number</label>
                                    <input type="text" placeholder="Identity Number" value={memIdNum} onChange={e => setMemIdNum(e.target.value)} />
                                </div>
                                <div className="form-group">
                                    <label>Allergies</label>
                                    <textarea placeholder="List known allergies" value={memAllergies} onChange={e => setMemAllergies(e.target.value)} style={{ minHeight: '60px' }} />
                                </div>
                                <div className="form-group">
                                    <label>Other Medical Information</label>
                                    <textarea placeholder="Chronic conditions, blood type, etc." value={memConditions} onChange={e => setMemConditions(e.target.value)} style={{ minHeight: '60px' }} />
                                </div>
                                <div className="form-group">
                                    <label>General Medical History</label>
                                    <textarea placeholder="Previous surgeries, major illnesses..." value={memHistory} onChange={e => setMemHistory(e.target.value)} style={{ minHeight: '60px' }} />
                                </div>
                                <div className="modal-actions">
                                    <button type="button" className="btn-outline" onClick={() => { setShowMemberForm(false); resetMemberForm(); }}>Cancel</button>
                                    <button type="submit" className="btn-primary" disabled={uploading}>
                                        {uploading ? 'Saving...' : (editingMemberId ? 'Save Changes' : 'Add Member')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

            </div>
        )
    }

    // View: Main Dashboard (Family Grid + Global Policies)
    const globalMedical = details.filter(d => d.category === 'Global_MedicalAid')
    const globalPolicies = details.filter(d => d.category === 'Global_Policy')

    return (
        <div className="details-container">
            <div className="details-header">
                <h1>My Life Details</h1>
            </div>

            {/* FAMILY SECTION */}
            <div className="hub-section">
                <h2>Family Details</h2>
                <div className="family-grid">
                    {members.map(m => (
                        <div key={m.id} className="family-card" onClick={() => setActiveMember(m)}>
                            <div className="family-avatar">
                                {m.photoUrl ? <img src={m.photoUrl} alt={m.name} /> : <span>{m.name[0]}</span>}
                            </div>
                            <div className="family-name">{m.name}</div>
                            <div className="family-role">{m.relationship}</div>
                        </div>
                    ))}

                    <div className="family-card add-card" onClick={() => setShowMemberForm(true)}>
                        <div className="add-icon">+</div>
                        <div>Add Member</div>
                    </div>
                </div>
            </div>

            <hr className="divider" />

            {/* MEDICAL AID SCHEME */}
            <div className="hub-section">
                <div className="section-header">
                    <h2>Medical Aid Scheme</h2>
                    <button className="btn-outline btn-sm"
                        onClick={() => setEditingDetail({ category: 'Global_MedicalAid', label: '', value: '' })}>
                        + Add Details
                    </button>
                </div>
                <div className="grid-cards-compact">
                    {globalMedical.map(item => (
                        <div key={item.id} className="info-card">
                            <div className="info-label">{item.label}</div>
                            <div className="info-value">{item.value}</div>
                            <button className="del-btn-corner" onClick={() => handleDeleteDetail(item.id)}>×</button>
                        </div>
                    ))}
                    {globalMedical.length === 0 && <div className="empty-state-text">No medical scheme details added.</div>}
                </div>
            </div>

            {/* POLICIES */}
            <div className="hub-section">
                <div className="section-header">
                    <h2>Insurance & Policies</h2>
                    <button className="btn-outline btn-sm"
                        onClick={() => setEditingDetail({ category: 'Global_Policy', label: '', value: '' })}>
                        + Add Policy
                    </button>
                </div>
                <div className="grid-cards-compact">
                    {globalPolicies.map(item => (
                        <div key={item.id} className="info-card">
                            <div className="info-label">{item.label}</div>
                            <div className="info-value">{item.value}</div>
                            {item.notes && <div className="info-notes">{item.notes}</div>}
                            <button className="del-btn-corner" onClick={() => handleDeleteDetail(item.id)}>×</button>
                        </div>
                    ))}
                    {globalPolicies.length === 0 && <div className="empty-state-text">No policies added.</div>}
                </div>
            </div>

            {/* Modals */}
            {showMemberForm && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>{editingMemberId ? 'Edit Profile' : 'Add Family Member'}</h3>
                        <form onSubmit={handleSaveMember}>
                            <div className="form-group">
                                <label>Name</label>
                                <input type="text" required value={memName} onChange={e => setMemName(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Relationship</label>
                                <input type="text" required placeholder="e.g. Spouse, Son" value={memRel} onChange={e => setMemRel(e.target.value)} />
                            </div>
                            {/* NEW FIELDS */}
                            <div className="form-group">
                                <label>ID Number</label>
                                <input type="text" placeholder="Identity Number" value={memIdNum} onChange={e => setMemIdNum(e.target.value)} />
                            </div>
                            <div className="form-group">
                                <label>Allergies</label>
                                <textarea placeholder="List known allergies" value={memAllergies} onChange={e => setMemAllergies(e.target.value)} style={{ minHeight: '60px' }} />
                            </div>
                            <div className="form-group">
                                <label>Other Medical Information</label>
                                <textarea placeholder="Chronic conditions, blood type, etc." value={memConditions} onChange={e => setMemConditions(e.target.value)} style={{ minHeight: '60px' }} />
                            </div>
                            <div className="form-group">
                                <label>General Medical History</label>
                                <textarea placeholder="Previous surgeries, major illnesses..." value={memHistory} onChange={e => setMemHistory(e.target.value)} style={{ minHeight: '60px' }} />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-outline" onClick={() => { setShowMemberForm(false); resetMemberForm(); }}>Cancel</button>
                                <button type="submit" className="btn-primary" disabled={uploading}>
                                    {uploading ? 'Saving...' : (editingMemberId ? 'Save Changes' : 'Add Member')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {editingDetail && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Add Info</h3>
                        <form onSubmit={handleSaveDetail}>
                            <div className="form-group">
                                <label>Label</label>
                                <input type="text" placeholder="e.g. Policy Number" required
                                    value={editingDetail.label}
                                    onChange={e => setEditingDetail({ ...editingDetail, label: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Value</label>
                                <input type="text" required
                                    value={editingDetail.value}
                                    onChange={e => setEditingDetail({ ...editingDetail, value: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Notes</label>
                                <textarea
                                    value={editingDetail.notes || ''}
                                    onChange={e => setEditingDetail({ ...editingDetail, notes: e.target.value })}
                                />
                            </div>
                            <div className="modal-actions">
                                <button type="button" className="btn-outline" onClick={() => setEditingDetail(null)}>Cancel</button>
                                <button type="submit" className="btn-primary">Save</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
