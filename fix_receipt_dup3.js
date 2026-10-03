import fs from 'fs';
let content = fs.readFileSync('src/components/Receipt.jsx', 'utf-8');
const searchStr = `});\n\nexport default Receipt;`;
content = content.replace("});\n});", "});");
fs.writeFileSync('src/components/Receipt.jsx', content);
