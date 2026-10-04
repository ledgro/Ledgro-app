import fs from 'fs';
let content = fs.readFileSync('src/pages/POS.jsx', 'utf-8');

if (!content.includes("putData")) {
    content = content.replace("import { hapticVibrate } from '../lib/utils';", "import { hapticVibrate, sanitizeText } from '../lib/utils';\nimport { putData } from '../lib/idb';");
}

fs.writeFileSync('src/pages/POS.jsx', content);
