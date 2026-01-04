import { Link, useLocation } from 'react-router-dom'
import './BudgetNav.css'

export default function BudgetNav() {
    const location = useLocation()
    const isActive = (path: string) => location.pathname === path

    return (
        <div className="budget-nav-container">
            <div className="budget-nav-list">
                <Link to="/budget" className={`budget-nav-link ${isActive('/budget') ? 'active' : ''}`}>
                    <span>Overview</span>
                </Link>
                <Link to="/transactions" className={`budget-nav-link ${isActive('/transactions') ? 'active' : ''}`}>
                    <span>Transactions</span>
                </Link>
                <Link to="/mappings" className={`budget-nav-link ${isActive('/mappings') ? 'active' : ''}`}>
                    <span>Mappings</span>
                </Link>
                <Link to="/how-it-works" className={`budget-nav-link ${isActive('/how-it-works') ? 'active' : ''}`}>
                    <span>How It Works</span>
                </Link>
            </div>
        </div>
    )
}
