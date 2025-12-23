# Personal Budget Management System

A comprehensive personal budget management application built with React, TypeScript, and Firebase. This system allows users to create budgets, upload bank statements, and automatically map transactions to budget categories.

## Features

### User Features
- **Budget Management**: Create and manage budget categories (e.g., Groceries, Entertainment, Medical)
- **Bank Statement Upload**: Upload CSV bank statements for automatic transaction import
- **Transaction Mapping**: Map bank transaction descriptions to readable names and budget categories
- **Budget vs Actual**: Compare actual spending against budgeted amounts
- **Dashboard**: View budget summary, spending overview, and quick actions

### Admin Features
- **User Management**: Manage users, assign roles (user, admin, systemadmin)
- **Mapping Management**: View and maintain transaction mappings for all users
- **System Configuration**: Configure default categories and system settings (system admin only)

## Technology Stack

- **React 18** with TypeScript
- **Vite** for build tooling
- **Firebase** (Authentication, Firestore, Storage)
- **React Router** for navigation
- **PapaParse** for CSV parsing
- **date-fns** for date formatting

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Firebase project with Authentication and Firestore enabled
- Firebase credentials in `.env` file

### Installation

1. Clone the repository:
```bash
git clone https://github.com/heinrichwest/Personal_budget.git
cd Personal_budget
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with your Firebase credentials:
```env
VITE_FIREBASE_API_KEY=your_api_key_here
VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

4. Deploy Firestore security rules:
   - Copy the contents of `firestore.rules`
   - Go to Firebase Console > Firestore Database > Rules
   - Paste and publish the rules

5. Start the development server:
```bash
npm run dev
```

6. Open your browser to `http://localhost:5173`

## First User Setup

The first user registered with the email `hein@speccon.co.za` will automatically be assigned the `systemadmin` role. This user can:
- Manage all users and their roles
- Configure system settings
- View and manage transaction mappings for all users

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── Layout.tsx       # Main layout with navigation
│   └── Layout.css
├── config/              # Configuration files
│   └── firebase.ts      # Firebase initialization
├── contexts/            # React contexts
│   └── AuthContext.tsx  # Authentication context
├── pages/               # Page components
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Dashboard.tsx
│   ├── Budget.tsx
│   ├── Transactions.tsx
│   └── admin/           # Admin pages
│       ├── AdminDashboard.tsx
│       ├── UserManagement.tsx
│       ├── SystemConfig.tsx
│       └── MappingManagement.tsx
└── main.tsx             # Application entry point
```

## Database Structure

### Collections

- **users**: User profiles with roles
- **budgets**: Budget categories per user
- **transactions**: Bank transactions per user
- **bankStatements**: Uploaded statement metadata
- **transactionMappings**: Mapping rules for transaction descriptions
- **systemConfig**: System-wide configuration

## CSV Upload Format

Bank statements should be CSV files with the following columns (case-insensitive):
- **Date**: Transaction date (any parseable date format)
- **Description/Details**: Transaction description
- **Amount**: Transaction amount (negative for debits, positive for credits)

Example:
```csv
Date,Description,Amount
2024-01-15,FRUIT & VEG CITY GATEWA GARSFONTEIN ZA,-125.50
2024-01-16,SALARY PAYMENT,5000.00
```

## Brand Guidelines

This application follows the SpecCon Holdings brand identity:
- **Primary Color**: Navy Blue (#12265E)
- **Accent Color**: Orange (#FFA600)
- **Typography**: Roboto (primary), Times New Roman (secondary)
- **Tone**: Intelligent, aspirational, structured, and inclusive

## Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory, ready for deployment to Firebase Hosting.

## Deployment

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase Hosting:
```bash
firebase init hosting
```

4. Build and deploy:
```bash
npm run build
firebase deploy --only hosting
```

## License

Copyright © SpecCon Holdings (Pty) Ltd

