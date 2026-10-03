import fs from 'fs';
let content = fs.readFileSync('src/components/Receipt.jsx', 'utf-8');

// Use forwardRef properly with hooks
content = content.replace(
  /const authContext = useAuth\(\); \/\/ React rules require hooks at the top unconditionally\n\s*if \(authContext\) shopProfile = authContext\.shop;/,
  `const authContext = useAuth();
  if (authContext) shopProfile = authContext.shop;`
);

fs.writeFileSync('src/components/Receipt.jsx', content);
