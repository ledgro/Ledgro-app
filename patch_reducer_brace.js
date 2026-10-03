import fs from 'fs';
let content = fs.readFileSync('src/reducers/billReducer.js', 'utf-8');
content = content + "\n  };\n};";
fs.writeFileSync('src/reducers/billReducer.js', content);
