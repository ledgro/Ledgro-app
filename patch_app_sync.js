import fs from 'fs';

let content = fs.readFileSync('src/App.jsx', 'utf-8');

// Filter pending bills on sync so a user doesn't sync another user's bills
content = content.replace(
  /const pending = await getAllData\('pendingBills'\);\n\s*for \(const bill of pending\) \{/,
  `const pending = await getAllData('pendingBills');
       for (const bill of pending) {
          // If a bill has a uid attached (new format), only sync if it matches the current user
          if (bill.uid && auth.currentUser && auth.currentUser.uid !== bill.uid) continue;`
);

fs.writeFileSync('src/App.jsx', content);
