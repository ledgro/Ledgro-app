import fs from 'fs';

let content = fs.readFileSync('src/lib/utils.js', 'utf-8');
content = content.replace("});\n}", "}"); // Fix syntax error in sanitizeText
fs.writeFileSync('src/lib/utils.js', content);
