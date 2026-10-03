import fs from 'fs';
let content = fs.readFileSync('src/components/Receipt.jsx', 'utf-8');
const searchStr = `  );
});

export default Receipt;`;
content = content.replace(searchStr + "\n});", searchStr);
fs.writeFileSync('src/components/Receipt.jsx', content);
