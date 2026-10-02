import fs from 'fs';

let content = fs.readFileSync('src/pages/POS.jsx', 'utf-8');

// Edit bill stock bug: We must restore the ORIGINAL bill's stock before we apply the NEW bill's deductions.
content = content.replace(
  /if \(editBill\) {\n\s*const originalBillRef = doc\(db, \`shops\/\$\{shopId\}\/bills\`, editBill\.id\);\n\s*batch\.update\(originalBillRef, {\n\s*type: 'reversal',\n\s*originalBillId: editBill\.id,\n\s*reversedBy: user\.uid,\n\s*reversedAt: serverTimestamp\(\)\n\s*}\);\n\s*}/,
  `if (editBill) {
        const originalBillRef = doc(db, \`shops/\${shopId}/bills\`, editBill.id);
        batch.update(originalBillRef, {
          type: 'reversal',
          originalBillId: editBill.id,
          reversedBy: user.uid,
          reversedAt: serverTimestamp()
        });

        // Restore original bill's stock quantities so we don't permanently lose stock during an edit
        if (editBill.items && Array.isArray(editBill.items)) {
          editBill.items.forEach(oldItem => {
            if (oldItem.catalogId) {
              const catalogRef = doc(db, \`shops/\${shopId}/catalog\`, oldItem.catalogId);
              batch.update(catalogRef, { stockCount: increment(oldItem.qty) });
            }
          });
        }
      }`
);

fs.writeFileSync('src/pages/POS.jsx', content);
