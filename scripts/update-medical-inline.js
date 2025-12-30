// ============================================
// PASTE THIS IN BROWSER CONSOLE
// ============================================
// 1. Open your Personal Budget app in browser
// 2. Login as an admin
// 3. Open DevTools (F12) -> Console tab
// 4. Paste this entire script and press Enter
// ============================================

// Import Firebase modules dynamically from CDN
const firebaseApp = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js');
const firebaseFirestore = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');

const { initializeApp, getApps } = firebaseApp;
const { getFirestore, collection, getDocs, writeBatch, doc } = firebaseFirestore;

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyBR0Q87-8RBEFW0fr1A0qJy5GC6NZ80OHw",
  authDomain: "personal-budget-bf36d.firebaseapp.com",
  projectId: "personal-budget-bf36d",
  storageBucket: "personal-budget-bf36d.firebasestorage.app",
  messagingSenderId: "492667020018",
  appId: "1:492667020018:web:4feaab6414252a7ff4e66b"
};

// Use existing app or initialize new one
let app;
const apps = getApps();
if (apps.length > 0) {
  app = apps[0];
} else {
  app = initializeApp(firebaseConfig);
}
const db = getFirestore(app);

console.log('%c Starting Medical -> Medical Aid category update...', 'color: blue; font-weight: bold');
console.log('%c Looking for: STRATUM, HEALTH SAV, MOMMEDSCH transactions with "Medical" category', 'color: gray');
console.log('');

const transactionsRef = collection(db, 'transactions');
const snapshot = await getDocs(transactionsRef);

let updatedCount = 0;
let batch = writeBatch(db);
let batchCount = 0;

const keywords = ['stratum', 'health sav', 'mommedsch'];

for (const docSnap of snapshot.docs) {
  const data = docSnap.data();
  const desc = (data.originalDescription || data.description || '').toLowerCase();

  const matchesKeyword = keywords.some(keyword => desc.includes(keyword));

  if (matchesKeyword && data.categoryName === 'Medical') {
    console.log(`%c Found: ${data.description}`, 'color: orange', `| Current: ${data.categoryName}`);

    batch.update(doc(db, 'transactions', docSnap.id), {
      categoryName: 'Medical Aid'
    });

    updatedCount++;
    batchCount++;

    if (batchCount >= 450) {
      await batch.commit();
      console.log(`%c Committed batch of ${batchCount} updates`, 'color: green');
      batch = writeBatch(db);
      batchCount = 0;
    }
  }
}

if (batchCount > 0) {
  await batch.commit();
  console.log(`%c Committed final batch of ${batchCount} updates`, 'color: green');
}

console.log('');
console.log(`%c Done! Updated ${updatedCount} transactions to "Medical Aid"`, 'color: green; font-weight: bold; font-size: 14px');
