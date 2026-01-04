import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Step } from 'react-joyride'
import PageTour from '../components/PageTour'
import './Dashboard.css'

interface ModuleCardProps {
    title: string
    description: string
    icon: React.ReactNode
    path: string
    color: string
    id?: string
}

function ModuleCard({ title, description, icon, path, color, id }: ModuleCardProps) {
    const navigate = useNavigate()

    return (
        <div
            id={id}
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

    // New Insurance Icon
    const InsuranceIcon = (
        <svg viewBox="0 0 24 24" width="32" height="32" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
        </svg>
    )

    const tourSteps: Step[] = [
        {
            target: 'body',
            content: <h2>Welcome to My Life!</h2>,
            placement: 'center',
            disableBeacon: true,
        },
        {
            target: '#tour-budget-card',
            content: 'Track your income, expenses, and analyze your financial health here.',
        },
        {
            target: '#tour-life-card',
            content: 'Manage personal details, medical aid, and family profiles.',
        },
        {
            target: '#tour-insurance-card',
            content: 'Keep track of all your insurance policies in one place.',
        },
        {
            target: '#tour-vault-card',
            content: 'Securely store important passwords and credentials.',
        },
        {
            target: '#tour-assets-card',
            content: 'Log your assets, warranties, and purchase slips.',
        },
        {
            target: '#tour-vehicles-card',
            content: 'Manage your vehicle registrations and service history.',
        },
    ]

    return (
        <div className="dashboard-hub">
            <PageTour pageId="dashboard" steps={tourSteps} />
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
                    id="tour-budget-card"
                />
                <ModuleCard
                    title="My Life Details"
                    description="Centralize your IDs, medical aid, and family profiles."
                    icon={LifeIcon}
                    path="/life-admin"
                    color="#3b82f6"
                    id="tour-life-card"
                />
                <ModuleCard
                    title="My Insurance"
                    description="Manage insurance policies and coverage details."
                    icon={InsuranceIcon}
                    path="/insurance"
                    color="#f59e0b"
                    id="tour-insurance-card"
                />
                <ModuleCard
                    title="My Vault"
                    description="Manage system passwords and sensitive credentials securely."
                    icon={VaultIcon}
                    path="/vault"
                    color="#ef4444"
                    id="tour-vault-card"
                />
                <ModuleCard
                    title="My Assets"
                    description="Track valuable household assets, warranties, and purchase slips."
                    icon={AssetIcon}
                    path="/assets"
                    color="#8b5cf6"
                    id="tour-assets-card"
                />
                <ModuleCard
                    title="My Vehicles"
                    description="Track vehicle registrations, license expiries, and service history."
                    icon={FleetIcon}
                    path="/fleet"
                    color="#ec4899"
                    id="tour-vehicles-card"
                />
            </div>
        </div>
    )
}
