import fs from 'fs';

let content = fs.readFileSync('src/pages/Ledger.jsx', 'utf-8');

// Fix 1: Calculate over-returns by querying past return bills
// Also correctly restore stock quantities (stockCount)
// Ensure discounts prorate properly (finalLineTotal)
const processReturnCode = `  const handleProcessReturn = async () => {
    if (!selectedBill || !shopId) return;

    // Check past returns for this bill
    let pastReturnedItems = {};
    try {
      const q = query(
        collection(db, \`shops/\${shopId}/bills\`),
        where('originalBillId', '==', selectedBill.id),
        where('type', '==', 'return')
      );
      const snapshot = await getDocs(q);
      snapshot.forEach(doc => {
        const data = doc.data();
        (data.items || []).forEach(item => {
          pastReturnedItems[item.name] = (pastReturnedItems[item.name] || 0) + item.qty;
        });
      });
    } catch (err) {
      console.warn("Failed to fetch past returns", err);
    }

    const returnedItemsList = [];
    let returnTotal = 0;

    for (let idx = 0; idx < selectedBill.items.length; idx++) {
      const item = selectedBill.items[idx];
      const returnQty = returnItems[idx] || 0;
      if (returnQty > 0) {
        const previouslyReturned = pastReturnedItems[item.name] || 0;
        if (returnQty + previouslyReturned > item.qty) {
          toast.error(\`Cannot return \${returnQty} \${item.name}. Only \${item.qty - previouslyReturned} left to return.\`);
          return;
        }

        // Calculate proportional refund amount based on final line total
        const unitRefund = (item.finalLineTotal ?? item.lineTotal) / item.qty;
        const lineRefund = unitRefund * returnQty;
        returnTotal += lineRefund;

        returnedItemsList.push({
          name: item.name,
          catalogId: item.catalogId || null,
          unitPrice: item.unitPrice,
          qty: returnQty,
          lineTotal: Math.round(lineRefund)
        });
      }
    }

    if (returnedItemsList.length === 0) return;

    if (!window.confirm(\`Process refund of \${formatCurrency(returnTotal)} via \${refundMethod.toUpperCase()}?\`)) return;

    if (localStorage.getItem('ledgro_haptic') !== 'false') hapticVibrate(20);

    try {
      const batch = writeBatch(db);

      const payload = {
        type: 'return',
        originalBillId: selectedBill.id,
        shopId: shopId,
        creatorId: user.uid,
        items: returnedItemsList,
        grandTotal: -Math.abs(Math.round(returnTotal)), // negative entry
        subtotal: -Math.abs(Math.round(returnTotal)),
        paymentMethod: refundMethod,
        createdAt: serverTimestamp(),
        clientCreatedAt: new Date().toISOString()
      };

      const newBillRef = doc(collection(db, \`shops/\${shopId}/bills\`));
      batch.set(newBillRef, payload);

      // Restore stock quantities
      returnedItemsList.forEach(item => {
        if (item.catalogId) {
          const catalogRef = doc(db, \`shops/\${shopId}/catalog\`, item.catalogId);
          batch.update(catalogRef, { stockCount: increment(item.qty) });
        }
      });

      await batch.commit();

      toast.success("Return processed successfully");
      setIsReturnDrawerOpen(false);
      setSelectedBill(null);
      setReturnItems({});

      // Opt UI
      setBills(prev => [{ id: newBillRef.id, ...payload, createdAt: { toDate: () => new Date() } }, ...prev]);
    } catch (err) {
      console.error(err);
      toast.error("Failed to process return");
    }
  };`;

content = content.replace(/const handleProcessReturn = async \(\) => \{[\s\S]*?toast\.error\("Failed to process return"\);\n    }\n  };/, processReturnCode);

// Fix void bill restoring stock Count
content = content.replace(
  /batch\.update\(catalogRef, \{ frequency: increment\(-1\) \}\);/,
  `batch.update(catalogRef, { frequency: increment(-1), stockCount: increment(item.qty || 1) });`
);

// We need to also add imports
if (!content.includes("where,")) {
  content = content.replace("import { collection,", "import { collection, query, where, getDocs,");
}

// In the drawer, show remaining returnable qty
content = content.replace(
  /<p className="text-xs text-slate-500">Max qty: \{item\.qty\} • ₹\{\(\(item\.finalLineTotal \?\? item\.lineTotal\) \/ item\.qty\)\.toFixed\(2\)\} ea<\/p>/,
  `<p className="text-xs text-slate-500">Max qty: {item.qty} • {formatCurrency((item.finalLineTotal ?? item.lineTotal) / item.qty)} ea</p>`
);


fs.writeFileSync('src/pages/Ledger.jsx', content);
