import { useState } from 'react'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { useAuth } from '../contexts/AuthContext'
import './PasswordChangeModal.css'

interface Props {
  onSuccess: () => void
}

export default function PasswordChangeModal({ onSuccess }: Props) {
  const { currentUser, clearPasswordChangeFlag } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters')
      return
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from current password')
      return
    }

    setLoading(true)

    try {
      if (!currentUser || !currentUser.email) {
        setError('No user logged in')
        return
      }

      // Re-authenticate user first
      const credential = EmailAuthProvider.credential(currentUser.email, currentPassword)
      await reauthenticateWithCredential(currentUser, credential)

      // Update password
      await updatePassword(currentUser, newPassword)

      // Clear the mustChangePassword flag
      await clearPasswordChangeFlag()

      onSuccess()
    } catch (err: any) {
      console.error('Password change error:', err)
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setError('Current password is incorrect')
      } else if (err.code === 'auth/weak-password') {
        setError('Password is too weak. Please choose a stronger password.')
      } else {
        setError(err.message || 'Failed to change password')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="password-modal-overlay">
      <div className="password-modal">
        <h2>Change Your Password</h2>
        <p className="password-modal-subtitle">
          For security, you must change your password before continuing.
        </p>

        {error && <div className="password-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="currentPassword">Current Password</label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              placeholder="Enter current password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="newPassword">New Password</label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={6}
              placeholder="Enter new password"
            />
          </div>

          <div className="form-group">
            <label htmlFor="confirmPassword">Confirm New Password</label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              placeholder="Confirm new password"
            />
          </div>

          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Changing Password...' : 'Change Password'}
          </button>
        </form>
      </div>
    </div>
  )
}
