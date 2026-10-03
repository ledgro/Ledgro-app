import fs from 'fs';
let content = fs.readFileSync('src/pages/POS.jsx', 'utf-8');

content = content.replace(
  /\/\/ eslint-disable-next-line react-hooks\/exhaustive-deps\n\s*\}, \[user, shopId\]\);/g,
  `// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, shopId]);`
);
fs.writeFileSync('src/pages/POS.jsx', content);
