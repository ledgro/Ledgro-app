import fs from 'fs';

let content = fs.readFileSync('src/pages/POS.jsx', 'utf-8');

// Ensure restored cart matches the current user and shopId
content = content.replace(
  /const \{ cartState, savedAt \} = JSON\.parse\(recovered\);/,
  `const { cartState, savedAt, uid, shopId: savedShopId } = JSON.parse(recovered);
        // Only restore if it belongs to the current user and shop
        if (uid !== user.uid || savedShopId !== shopId) {
          localStorage.removeItem('ledgro-cart-recovery');
          return;
        }`
);

fs.writeFileSync('src/pages/POS.jsx', content);
