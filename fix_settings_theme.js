import fs from 'fs';
let content = fs.readFileSync('src/pages/Settings.jsx', 'utf-8');

const regex = /const handleThemeChange = \(newTheme\) => \{[\s\S]*?\}\s*else \{\s*document\.documentElement\.setAttribute\('data-theme', 'light'\);\s*\}\s*\};\n/g;

content = content.replace(regex, "");

fs.writeFileSync('src/pages/Settings.jsx', content);
