# Quick Setup Guide

## Prerequisites
- Node.js 18+ installed
- Firebase project created
- Firebase Authentication enabled (Email/Password)
- Firestore Database enabled

## Installation Steps

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Firebase**
   - Create a `.env` file in the root directory
   - Add your Firebase credentials:
   ```
   VITE_FIREBASE_API_KEY=your_api_key_here
   VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```

3. **Deploy Firestore Security Rules**
   - Go to Firebase Console > Firestore Database > Rules
   - Copy the contents of `firestore.rules`
   - Paste and publish the rules

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **First User Setup**
   - Register with email: `hein@speccon.co.za`
   - This user will automatically be assigned the `systemadmin` role
   - System admin can manage all users, mappings, and system configuration

## CSV Upload Format

Your bank statement CSV should have columns (case-insensitive):
- **Date**: Transaction date
- **Description/Details**: Transaction description
- **Amount**: Transaction amount (negative for debits)

Example:
```csv
Date,Description,Amount
2024-01-15,FRUIT & VEG CITY GATEWA GARSFONTEIN ZA,-125.50
2024-01-16,SALARY PAYMENT,5000.00
```

## Building for Production

```bash
npm run build
```

The `dist` folder will contain the production build ready for Firebase Hosting.

## Deployment to Firebase Hosting

1. Install Firebase CLI: `npm install -g firebase-tools`
2. Login: `firebase login`
3. Initialize: `firebase init hosting`
4. Build and deploy: `npm run build && firebase deploy --only hosting`

