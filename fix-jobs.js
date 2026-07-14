const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function fixJobs() {
  const snap = await db.collection('jobs').get();
  let fixed = 0;
  
  for (const doc of snap.docs) {
    const data = doc.data();
    const updates = {};
    
    if (!data.description) {
      updates.description = `${data.jobRole || 'Job'} opportunity at ${data.companyName || 'Company'}. Apply now!`;
      fixed++;
    }
    
    if (!data.datePosted) {
      updates.datePosted = new Date(data.timestamp || Date.now()).toISOString();
      fixed++;
    }
    
    if (!data.jobLocation || !data.jobLocation.address) {
      updates.jobLocation = {
        address: {
          addressLocality: data.workLocation || 'India',
          addressCountry: 'IN'
        }
      };
      fixed++;
    }
    
    if (Object.keys(updates).length > 0) {
      await doc.ref.update(updates);
      console.log(`✅ Fixed: ${data.jobRole || 'Job'}`);
    }
  }
  
  console.log(`✅ Fixed ${fixed} jobs!`);
}

fixJobs().then(() => process.exit());