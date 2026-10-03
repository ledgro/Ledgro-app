import fs from 'fs';
let content = fs.readFileSync('src/components/Receipt.jsx', 'utf-8');

const regex = /\n\s*\/\/ 1\. Fix date to be exact time of sale\n\s*const dateStr = useMemo\(\(\) => \{\n\s*if \(clientCreatedAt\) return new Date\(clientCreatedAt\)\.toLocaleString\(\);\n\s*if \(createdAt && typeof createdAt\.toDate === 'function'\) return createdAt\.toDate\(\)\.toLocaleString\(\);\n\s*if \(createdAt\) return new Date\(createdAt\)\.toLocaleString\(\);\n\s*return new Date\(\)\.toLocaleString\(\);\n\s*\}, \[createdAt, clientCreatedAt\]\);\n\n\s*\/\/ 6\. Fix fallback bill number stability\n\s*if \(billData\.id\) return billData\.id;\n\s*const arr = new Uint8Array\(3\);\n\s*crypto\.getRandomValues\(arr\);\n\s*const suffix = Array\.from\(arr, b => b\.toString\(16\)\.padStart\(2, '0'\)\)\.join\(''\)\.toUpperCase\(\);\n\s*return `\$\{new Date\(\)\.toLocaleDateString\('en-GB'\)\.replace\(\/\\\/\/g, ''\)\}-\$\{suffix\}`;\n\s*\}, \[billData\.billNo, billData\.id\]\);/g;

content = content.replace(regex, "");
fs.writeFileSync('src/components/Receipt.jsx', content);
