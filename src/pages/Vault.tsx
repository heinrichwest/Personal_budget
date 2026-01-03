export default function Vault() {
    return (
        <div className="container">
            <h1>My Vault</h1>
            <p>Secure password and credential storage.</p>
            <div className="warning-banner" style={{ background: '#fee2e2', color: '#dc2626', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
                <strong>Security Notice:</strong> End-to-end encryption will be implemented here. Use with caution during development.
            </div>
        </div>
    )
}
