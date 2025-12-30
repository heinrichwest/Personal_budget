import './HowItWorks.css'

export default function HowItWorks() {
  return (
    <div className="how-it-works-container">
      <div className="how-it-works-header">
        <h1>How It Works</h1>
        <p>A step-by-step guide to managing your personal budget</p>
      </div>

      <div className="steps-container">
        {/* Step 1: Upload Bank Statement */}
        <div className="step-card">
          <div className="step-number">1</div>
          <div className="step-content">
            <h2>Upload Your Bank Statement</h2>
            <p>Start by uploading your bank statement to import your transactions automatically.</p>
            <div className="step-details">
              <h4>How to upload:</h4>
              <ul>
                <li>Go to the <strong>Transactions</strong> page</li>
                <li>Click the <strong>Upload Statement</strong> button</li>
                <li>Select your bank statement file (CSV or Excel format)</li>
                <li>The system will automatically parse and import your transactions</li>
              </ul>
              <div className="tip-box">
                <span className="tip-icon">💡</span>
                <span>Most banks allow you to download statements in CSV format from your online banking portal.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 2: Understanding Transactions */}
        <div className="step-card">
          <div className="step-number">2</div>
          <div className="step-content">
            <h2>Review Your Transactions</h2>
            <p>Once uploaded, your transactions appear in a list showing the date, description, and amount.</p>
            <div className="step-details">
              <h4>Transaction details include:</h4>
              <ul>
                <li><strong>Date:</strong> When the transaction occurred</li>
                <li><strong>Original Description:</strong> The raw text from your bank</li>
                <li><strong>Mapped Description:</strong> A cleaner, readable name</li>
                <li><strong>Amount:</strong> Positive for income, negative for expenses</li>
                <li><strong>Category:</strong> The budget category assigned to this transaction</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 3: Mappings */}
        <div className="step-card">
          <div className="step-number">3</div>
          <div className="step-content">
            <h2>How Mappings Work</h2>
            <p>Mappings automatically transform cryptic bank descriptions into readable names and assign categories.</p>
            <div className="step-details">
              <h4>Mapping features:</h4>
              <ul>
                <li><strong>Auto-mapping:</strong> When you upload transactions, the system checks if a mapping exists for each description</li>
                <li><strong>System mappings:</strong> Pre-configured mappings that work for all users (e.g., "CHECKERS" → "Groceries")</li>
                <li><strong>Personal overrides:</strong> Create your own mappings that override system defaults</li>
                <li><strong>Category assignment:</strong> Each mapping can include a category for automatic categorization</li>
              </ul>
              <div className="example-box">
                <h5>Example:</h5>
                <div className="mapping-example">
                  <div className="mapping-from">
                    <span className="label">Bank shows:</span>
                    <code>POS PURCHASE CHECKERS SANDTON 12345</code>
                  </div>
                  <div className="mapping-arrow">→</div>
                  <div className="mapping-to">
                    <span className="label">Becomes:</span>
                    <code>Checkers</code>
                    <span className="category-tag">Groceries</span>
                  </div>
                </div>
              </div>
              <h4>Managing mappings:</h4>
              <ul>
                <li>Go to the <strong>Mappings</strong> page to view all mappings</li>
                <li>Click <strong>Edit</strong> to change a mapping's description or category</li>
                <li>Click <strong>Ignore</strong> to exclude a transaction type from categorization</li>
                <li>Use <strong>Revert to System</strong> to remove your personal override</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Step 4: Categories */}
        <div className="step-card">
          <div className="step-number">4</div>
          <div className="step-content">
            <h2>Understanding Categories</h2>
            <p>Categories help you group similar transactions together for better budget tracking.</p>
            <div className="step-details">
              <h4>Default categories include:</h4>
              <div className="category-grid">
                <span className="category-item">Income</span>
                <span className="category-item">Groceries</span>
                <span className="category-item">Transport</span>
                <span className="category-item">Entertainment</span>
                <span className="category-item">Utilities</span>
                <span className="category-item">Medical</span>
                <span className="category-item">Insurance</span>
                <span className="category-item">Savings</span>
              </div>
              <h4>Assigning categories:</h4>
              <ul>
                <li><strong>Via mappings:</strong> Categories are automatically assigned based on transaction mappings</li>
                <li><strong>Manual assignment:</strong> Click on a transaction to manually assign or change its category</li>
                <li><strong>Bulk updates:</strong> When you edit a mapping, all matching transactions are updated automatically</li>
              </ul>
              <div className="tip-box">
                <span className="tip-icon">💡</span>
                <span>New categories are created automatically when you assign them to mappings. They'll appear in your Budget page.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Step 5: Setting Your Budget */}
        <div className="step-card">
          <div className="step-number">5</div>
          <div className="step-content">
            <h2>Setting Your Budget</h2>
            <p>Create monthly budget limits for each category to track your spending goals.</p>
            <div className="step-details">
              <h4>How to set budgets:</h4>
              <ul>
                <li>Go to the <strong>Budget</strong> page</li>
                <li>You'll see all your categories listed</li>
                <li>Enter a monthly budget amount for each category</li>
                <li>Click <strong>Save</strong> to update your budgets</li>
              </ul>
              <h4>Budget tracking:</h4>
              <ul>
                <li>The system compares your actual spending against your budget</li>
                <li>Progress bars show how much of each budget you've used</li>
                <li>Color indicators show when you're approaching or exceeding limits</li>
              </ul>
              <div className="budget-visual">
                <div className="budget-bar">
                  <div className="budget-label">Groceries</div>
                  <div className="budget-progress">
                    <div className="budget-fill green" style={{ width: '60%' }}></div>
                  </div>
                  <div className="budget-amount">R3,000 / R5,000</div>
                </div>
                <div className="budget-bar">
                  <div className="budget-label">Entertainment</div>
                  <div className="budget-progress">
                    <div className="budget-fill yellow" style={{ width: '85%' }}></div>
                  </div>
                  <div className="budget-amount">R850 / R1,000</div>
                </div>
                <div className="budget-bar">
                  <div className="budget-label">Transport</div>
                  <div className="budget-progress">
                    <div className="budget-fill red" style={{ width: '110%' }}></div>
                  </div>
                  <div className="budget-amount">R2,200 / R2,000</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Step 6: Analyzing Your Finances */}
        <div className="step-card">
          <div className="step-number">6</div>
          <div className="step-content">
            <h2>Analyzing Your Finances</h2>
            <p>Use the Dashboard to get insights into your spending patterns and financial health.</p>
            <div className="step-details">
              <h4>Dashboard features:</h4>
              <ul>
                <li><strong>Monthly summary:</strong> Total income vs. expenses at a glance</li>
                <li><strong>Category breakdown:</strong> See where your money goes</li>
                <li><strong>Budget vs. Actual:</strong> Compare planned spending to reality</li>
                <li><strong>Trends:</strong> Track spending patterns over time</li>
                <li><strong>Unmapped transactions:</strong> Quickly identify transactions that need categorization</li>
              </ul>
              <h4>Drill-down into transactions:</h4>
              <ul>
                <li><strong>Click any cell:</strong> Click on any amount in the report to view all transactions that make up that total</li>
                <li><strong>Edit transactions:</strong> From the popup, click "Edit" on any transaction to change its description, category, or reporting month</li>
                <li><strong>Reporting Month:</strong> Each transaction has a reporting month that determines which column it appears in on the Dashboard</li>
              </ul>
              <div className="tip-box">
                <span className="tip-icon">💡</span>
                <span>If a transaction appears in the wrong month, you can change its Reporting Month to move it to the correct period.</span>
              </div>
              <h4>Tips for better analysis:</h4>
              <ul>
                <li>Upload statements regularly to keep data current</li>
                <li>Categorize all transactions for accurate reports</li>
                <li>Review and adjust budgets monthly based on actual spending</li>
                <li>Use the reporting month to correctly assign transactions to their spending period</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Quick Start Summary */}
        <div className="quick-start-card">
          <h2>Quick Start Checklist</h2>
          <div className="checklist">
            <label className="checklist-item">
              <input type="checkbox" />
              <span>Upload your first bank statement</span>
            </label>
            <label className="checklist-item">
              <input type="checkbox" />
              <span>Review and categorize unmapped transactions</span>
            </label>
            <label className="checklist-item">
              <input type="checkbox" />
              <span>Set up your monthly budget amounts</span>
            </label>
            <label className="checklist-item">
              <input type="checkbox" />
              <span>Check your Dashboard for insights</span>
            </label>
            <label className="checklist-item">
              <input type="checkbox" />
              <span>Create custom mappings for recurring transactions</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
