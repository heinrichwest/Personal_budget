import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin using Application Default Credentials
// Run: gcloud auth application-default login
// Or set GOOGLE_APPLICATION_CREDENTIALS env var to point to service account key
initializeApp({
  credential: applicationDefault(),
  projectId: 'personal-budget-bf36d'
});

const db = getFirestore();

async function updateMedicalTransactions() {
  console.log('Starting Medical -> Medical Aid category update...');
  console.log('Looking for: STRATUM, HEALTH SAV, MOMMEDSCH transactions with "Medical" category\n');

  // Get all transactions
  const transactionsSnap = await db.collection('transactions').get();

  let updatedCount = 0;
  let batch = db.batch();
  let batchCount = 0;

  // Keywords to match
  const keywords = ['stratum', 'health sav', 'mommedsch'];

  for (const doc of transactionsSnap.docs) {
    const data = doc.data();
    const desc = (data.originalDescription || data.description || '').toLowerCase();

    // Check if this transaction matches any of the keywords and has "Medical" category
    const matchesKeyword = keywords.some(keyword => desc.includes(keyword));

    if (matchesKeyword && data.categoryName === 'Medical') {
      console.log(`Found: ${doc.id} - ${data.description} - Current: ${data.categoryName}`);

      batch.update(doc.ref, {
        categoryName: 'Medical Aid'
      });

      updatedCount++;
      batchCount++;

      // Commit in batches of 450
      if (batchCount >= 450) {
        await batch.commit();
        console.log(`Committed batch of ${batchCount} updates`);
        batch = db.batch();
        batchCount = 0;
      }
    }
  }

  // Commit remaining
  if (batchCount > 0) {
    await batch.commit();
    console.log(`Committed final batch of ${batchCount} updates`);
  }

  console.log(`\nDone! Updated ${updatedCount} transactions to "Medical Aid"`);
}

updateMedicalTransactions().catch(console.error);
