import fs from 'fs';
let content = fs.readFileSync('src/reducers/billReducer.js', 'utf-8');
content = content.replace("  });\n\n  // Calculate global discount (everything is in paise)", "  });\n\n  // Calculate global discount (everything is in paise)");
fs.writeFileSync('src/reducers/billReducer.js', content);
