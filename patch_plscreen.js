import fs from 'fs';

let content = fs.readFileSync('src/pages/PLScreen.jsx', 'utf-8');

// Replace innerHTML with DOM creation
content = content.replace(
  /header\.innerHTML\s*=\s*`<h2.*?<\/p>`\s*;/s,
  `const h2 = document.createElement('h2');
      h2.style.cssText = "font-size:24px; font-weight:bold; color:#0F172A; text-align:center; margin-bottom:4px;";
      h2.textContent = \`\${shopName || 'Shop'} P&L\`;
      const p = document.createElement('p');
      p.style.cssText = "font-size:14px; color:#64748B; text-align:center;";
      p.textContent = (startDate && endDate) ? \`\${new Date(startDate).toLocaleDateString()} - \${new Date(endDate).toLocaleDateString()}\` : 'All Time';
      header.appendChild(h2);
      header.appendChild(p);`
);

fs.writeFileSync('src/pages/PLScreen.jsx', content);
