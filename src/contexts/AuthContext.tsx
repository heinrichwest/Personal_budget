import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  User,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { auth, db } from '../config/firebase'

interface UserRole {
  role: 'user' | 'admin' | 'systemadmin'
  email: string
  displayName?: string
  createdAt: Date
}

interface AuthContextType {
  currentUser: User | null
  userRole: UserRole | null
  isAdmin: boolean
  isSystemAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName?: string) => Promise<void>
  logout: () => Promise<void>
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
      // Check if this is the first user (system admin)
      const isSystemAdmin = email === 'hein@speccon.co.za'
      
      const userData: UserRole = {
        role: isSystemAdmin ? 'systemadmin' : 'user',
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
    loading,
    login,
    register,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

