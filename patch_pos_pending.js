import fs from 'fs';

let content = fs.readFileSync('src/pages/POS.jsx', 'utf-8');

// Tag offline pending bills with uid and shopId
content = content.replace(
  /await putData\('pendingBills', \{ id: newBillRef\.id, path: \`shops\/\$\{shopId\}\/bills\/\$\{newBillRef\.id\}\`, data: payload \}\);/,
  `await putData('pendingBills', { id: newBillRef.id, uid: user.uid, shopId: shopId, path: \`shops/\${shopId}/bills/\${newBillRef.id}\`, data: payload });`
);

fs.writeFileSync('src/pages/POS.jsx', content);
