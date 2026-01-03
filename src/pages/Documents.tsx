import { useState, useEffect } from 'react'
import { collection, query, where, addDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'
import { db, storage } from '../config/firebase'
import { useAuth } from '../contexts/AuthContext'
import './LifeDetails.css'

interface LifeDocument {
    id: string
    name: string
    type: string
    storagePath: string
    downloadUrl: string
    createdAt: any
}

export default function Documents() {
    const { currentUser } = useAuth()
    const [docs, setDocs] = useState<LifeDocument[]>([])
    const [loading, setLoading] = useState(true)
    const [showForm, setShowForm] = useState(false)
    const [uploading, setUploading] = useState(false)

    // Form
    const [name, setName] = useState('')
    const [type, setType] = useState('General')
    const [file, setFile] = useState<File | null>(null)

    const docTypes = ['Testament', 'Insurance', 'Contract', 'ID/Passport', 'Vehicle', 'General']

    useEffect(() => {
        if (!currentUser) return

        const q = query(collection(db, 'documents'), where('userId', '==', currentUser.uid))
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const items: LifeDocument[] = []
                snapshot.forEach((doc) => {
                    items.push({ id: doc.id, ...doc.data() } as LifeDocument)
                })
                setDocs(items)
                setLoading(false)
            },
            (err) => {
                console.error("Error fetching documents:", err)
                setLoading(false)
                alert("Error loading documents: " + err.message)
            }
        )

        return () => unsubscribe()
    }, [currentUser])

    async function handleUpload(e: React.FormEvent) {
        e.preventDefault()
        if (!currentUser || !file) return

        setUploading(true)
        try {
            const storagePath = `users/${currentUser.uid}/documents/${Date.now()}_${file.name}`
            const storageRef = ref(storage, storagePath)

            await uploadBytes(storageRef, file)
            const url = await getDownloadURL(storageRef)

            await addDoc(collection(db, 'documents'), {
                userId: currentUser.uid,
                name,
                type,
                storagePath,
                downloadUrl: url,
                createdAt: new Date()
            })

            setShowForm(false)
            setName('')
            setFile(null)
        } catch (error) {
            console.error('Error uploading:', error)
            alert('Failed to upload document. Please try again.')
        } finally {
            setUploading(false)
        }
    }

    async function handleDelete(id: string, storagePath: string) {
        if (!confirm('Delete this document?')) return

        try {
            // 1. Delete from Storage
            const storageRef = ref(storage, storagePath)
            await deleteObject(storageRef).catch(e => console.warn("Storage delete failed", e))

            // 2. Delete from Firestore
            await deleteDoc(doc(db, 'documents', id))
        } catch (error) {
            console.error('Error deleting:', error)
        }
    }

    if (loading) return <div className="loading">Loading documents...</div>

    return (
        <div className="details-container">
            <div className="details-header">
                <h1>My Documents</h1>
                <button className="btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? 'Cancel' : '+ Upload Document'}
                </button>
            </div>

            {showForm && (
                <div className="detail-form-card">
                    <form onSubmit={handleUpload}>
                        <div className="form-group">
                            <label>Document Name</label>
                            <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Last Will & Testament" />
                        </div>
                        <div className="form-group">
                            <label>Type</label>
                            <select value={type} onChange={e => setType(e.target.value)}>
                                {docTypes.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                        </div>
                        <div className="form-group">
                            <label>File</label>
                            <input type="file" onChange={e => setFile(e.target.files ? e.target.files[0] : null)} required />
                        </div>
                        <button type="submit" className="btn-primary" disabled={uploading}>
                            {uploading ? 'Uploading...' : 'Save Document'}
                        </button>
                    </form>
                </div>
            )}

            <div className="details-grid">
                {docs.map(doc => (
                    <div key={doc.id} className="category-card document-card">
                        <div className="doc-icon">📄</div>
                        <div className="doc-info">
                            <h3>{doc.name}</h3>
                            <span className="badge badge-secondary">{doc.type}</span>
                        </div>
                        <div className="doc-actions">
                            <a href={doc.downloadUrl} target="_blank" rel="noopener noreferrer" className="btn-outline btn-sm">View</a>
                            <button className="btn-icon" onClick={() => handleDelete(doc.id, doc.storagePath)}>🗑️</button>
                        </div>
                    </div>
                ))}
                {docs.length === 0 && !showForm && (
                    <div className="empty-state">No documents uploaded yet.</div>
                )}
            </div>
        </div>
    )
}
