// Run this script in the browser console while logged in as admin
// Go to your app, open DevTools (F12), paste this in Console

async function updateMedicalCategories() {
  // Import Firebase from the window (since it's already loaded)
  const { collection, getDocs, writeBatch, doc } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');

  // Get db from window - it should be available from your app
  const db = window.__FIREBASE_DB__ || firebase.firestore();

  console.log('Starting Medical -> Medical Aid category update...');
  console.log('Looking for: STRATUM, HEALTH SAV, MOMMEDSCH transactions with "Medical" category\n');

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
      console.log(`Found: ${docSnap.id} - ${data.description} - Current: ${data.categoryName}`);

      batch.update(doc(db, 'transactions', docSnap.id), {
        categoryName: 'Medical Aid'
      });

      updatedCount++;
      batchCount++;

      if (batchCount >= 450) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} updates`);
        batch = writeBatch(db);
        batchCount = 0;
      }
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchCount} updates`);
  }

  console.log(`\nDone! Updated ${updatedCount} transactions to "Medical Aid"`);
}

updateMedicalCategories();
