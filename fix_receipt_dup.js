import fs from 'fs';
let content = fs.readFileSync('src/components/Receipt.jsx', 'utf-8');

const regex = /const \{ items = \[\], subtotal = 0, globalDiscountAmt = 0, grandTotal = 0, paymentMethod, shopName, createdAt, clientCreatedAt, payment \} = billData;/;
content = content.replace(regex, "");
const regex2 = /\/\/ 1\. Fix date to be exact time of sale\s*const dateStr = useMemo\(\(\) => \{\s*if \(clientCreatedAt\) return new Date\(clientCreatedAt\)\.toLocaleString\(\);\s*if \(createdAt && typeof createdAt\.toDate === 'function'\) return createdAt\.toDate\(\)\.toLocaleString\(\);\s*if \(createdAt\) return new Date\(createdAt\)\.toLocaleString\(\);\s*return new Date\(\)\.toLocaleString\(\);\s*\}, \[createdAt, clientCreatedAt\]\);\s*\/\/ 6\. Fix fallback bill number stability\s*const billNo = useMemo\(\(\) => \{\s*if \(billData\.billNo\) return billData\.billNo;\s*if \(billData\.id\) return billData\.id;\s*const arr = new Uint8Array\(3\);\s*crypto\.getRandomValues\(arr\);\s*const suffix = Array\.from\(arr, b => b\.toString\(16\)\.padStart\(2, '0'\)\)\.join\(''\)\.toUpperCase\(\);\s*return `\${new Date\(\)\.toLocaleDateString\('en-GB'\)\.replace\(\/\\\/\/g, ''\)}-\${suffix}`;\s*\}, \[billData\?\.billNo, billData\?\.id, billData\]\);/g;

content = content.replace(regex2, "");

// And remove second declaration
content = content.replace(/const billNo = useMemo\(\(\) => \{\n\s*if \(billData\.billNo\) return billData\.billNo;/g, "");

fs.writeFileSync('src/components/Receipt.jsx', content);
