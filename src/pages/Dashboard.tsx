import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import './Dashboard.css'

interface ModuleCardProps {
    title: string
    description: string
    icon: React.ReactNode
    path: string
    color: string
}

function ModuleCard({ title, description, icon, path, color }: ModuleCardProps) {
    const navigate = useNavigate()

    return (
        <div
            className="module-card"
            onClick={() => navigate(path)}
            style={{ '--card-accent-color': color } as React.CSSProperties}
        >
            <div className="module-icon">
                {icon}
            </div>
            <div className="module-content">
                <h3>{title}</h3>
                <p>{description}</p>
            </div>
            <div className="module-arrow">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
            </div>
        </div>
    )
}

export default function Dashboard() {
    const { currentUser } = useAuth()

    // Icons (Simple SVG implementations)
    const BudgetIcon = (
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
    )

    const VaultIcon = (
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
    )

    const DocIcon = (
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
        </svg>
    )

    const LifeIcon = (
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
        </svg>
    )

    const AssetIcon = (
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"></path>
        </svg>
    )

    const FleetIcon = (
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="3" width="15" height="13"></rect>
            <polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon>
            <circle cx="5.5" cy="18.5" r="2.5"></circle>
            <circle cx="18.5" cy="18.5" r="2.5"></circle>
        </svg>
    )

    return (
        <div className="dashboard-hub">
            <header className="hub-header">
                <h1>Welcome back, {currentUser?.email?.split('@')[0]}</h1>
                <p>Manage your entire life in one secure place.</p>
            </header>

            <div className="hub-grid">
                <ModuleCard
                    title="Personal Budget"
                    description="Track income, expenses, and analyze your financial health."
                    icon={BudgetIcon}
                    path="/budget"
                    color="#10b981"
                />
                <ModuleCard
                    title="My Life Details"
                    description="Centralize your IDs, medical aid, policies, and bank details."
                    icon={LifeIcon}
                    path="/life-admin"
                    color="#3b82f6"
                />
                <ModuleCard
                    title="My Documents"
                    description="Securely store testaments, insurance policies, and contracts."
                    icon={DocIcon}
                    path="/documents"
                    color="#f59e0b"
                />
                <ModuleCard
                    title="My Vault"
                    description="Manage system passwords and sensitive credentials securely."
                    icon={VaultIcon}
                    path="/vault"
                    color="#ef4444"
                />
                <ModuleCard
                    title="My Assets"
                    description="Track valuable assets, warranties, and purchase slips."
                    icon={AssetIcon}
                    path="/assets"
                    color="#8b5cf6"
                />
                <ModuleCard
                    title="My Fleet"
                    description="Track vehicle registrations, license expiries, and service history."
                    icon={FleetIcon}
                    path="/fleet"
                    color="#ec4899"
                />
            </div>
        </div>
    )
}
