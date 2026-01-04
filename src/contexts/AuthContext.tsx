import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, arrayUnion, query, collection, where, getDocs } from 'firebase/firestore'
import { auth, db } from '../config/firebase'

interface UserRole {
  role: 'user' | 'admin' | 'systemadmin'
  email: string
  displayName?: string
  createdAt: Date
  mustChangePassword?: boolean
  seenTours?: string[] // Array of page IDs where tour has been seen
}

interface AuthContextType {
  currentUser: User | null
  userRole: UserRole | null
  isAdmin: boolean
  isSystemAdmin: boolean
  mustChangePassword: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName?: string) => Promise<void>
  logout: () => Promise<void>
  clearPasswordChangeFlag: () => Promise<void>
  completeTour: (pageId: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [userRole, setUserRole] = useState<UserRole | null>(null)
  const [loading, setLoading] = useState(true)

  async function createUserProfile(user: User, email: string, displayName?: string) {
    const userRef = doc(db, 'users', user.uid)
    const userSnap = await getDoc(userRef)

    if (!userSnap.exists()) {
      // 1. Check for Pre-assigned Role
      let assignedRole: 'user' | 'admin' | 'systemadmin' = 'user'

      try {
        const q = query(collection(db, 'role_assignments'), where('email', '==', email.toLowerCase()))
        const snapshot = await getDocs(q)
        if (!snapshot.empty) {
          const assignment = snapshot.docs[0].data()
          if (assignment.role) assignedRole = assignment.role
        } else {
          // 2. Fallback: Check hardcoded System Admin
          if (email === 'hein@speccon.co.za') {
            assignedRole = 'systemadmin'
          }
        }
      } catch (e) {
        console.error("Error checking role assignments", e)
      }

      const userData: UserRole = {
        role: assignedRole,
        email: email,
        displayName: displayName || email.split('@')[0],
        createdAt: new Date(),
      }

      await setDoc(userRef, userData)
      setUserRole(userData)
    } else {
      const data = userSnap.data() as UserRole
      setUserRole({
        ...data,
        createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
      })
    }
  }

  async function login(email: string, password: string) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    await createUserProfile(userCredential.user, email)
  }

  async function register(email: string, password: string, displayName?: string) {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    await createUserProfile(userCredential.user, email, displayName)
  }

  async function logout() {
    await signOut(auth)
    setUserRole(null)
  }

  async function clearPasswordChangeFlag() {
    if (!currentUser) return
    const userRef = doc(db, 'users', currentUser.uid)
    await setDoc(userRef, { mustChangePassword: false }, { merge: true })
    setUserRole(prev => prev ? { ...prev, mustChangePassword: false } : null)
  }

  async function completeTour(pageId: string) {
    if (!currentUser) return
    const userRef = doc(db, 'users', currentUser.uid)

    // Firestore update
    await updateDoc(userRef, {
      seenTours: arrayUnion(pageId)
    })

    // Local state update
    setUserRole(prev => {
      if (!prev) return null
      const currentSeen = prev.seenTours || []
      if (currentSeen.includes(pageId)) return prev
      return { ...prev, seenTours: [...currentSeen, pageId] }
    })
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (user) {
        const userRef = doc(db, 'users', user.uid)
        const userSnap = await getDoc(userRef)
        if (userSnap.exists()) {
          const data = userSnap.data() as UserRole
          setUserRole({
            ...data,
            createdAt: data.createdAt instanceof Date ? data.createdAt : new Date(data.createdAt),
          })
        } else {
          // Create profile if it doesn't exist
          await createUserProfile(user, user.email || '')
        }
      } else {
        setUserRole(null)
      }
      setLoading(false)
    })

    return unsubscribe
  }, [])

  const value: AuthContextType = {
    currentUser,
    userRole,
    isAdmin: userRole?.role === 'admin' || userRole?.role === 'systemadmin',
    isSystemAdmin: userRole?.role === 'systemadmin',
    mustChangePassword: userRole?.mustChangePassword === true,
    loading,
    login,
    register,
    logout,
    clearPasswordChangeFlag,
    completeTour
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
