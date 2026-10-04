import fs from 'fs';

let content = fs.readFileSync('src/pages/POS.jsx', 'utf-8');

content = content.replace(
  /        const ageMs = Date\.now\(\) - new Date\(savedAt\)\.getTime\(\);\n\s*if \(ageMs < 5 \* 60 \* 1000\) \{ \/\/ Only restore if less than 5 mins old\n\s*dispatch\(\{ type: 'INIT_FROM_EDIT', payload: \{ items: cartState\.items, globalDiscount: cartState\.globalDiscount \} \}\);\n\s*toast\.success\('Cart restored after app update'\);\n\s*}\n\s*localStorage\.removeItem\('ledgro-cart-recovery'\);\n\s*\} catch \(e\) \{\n\s*localStorage\.removeItem\('ledgro-cart-recovery'\);\n\s*\}\n\s*\}\n\s*\}, \[\]\);/,
  `        const ageMs = Date.now() - new Date(savedAt).getTime();
        if (ageMs < 5 * 60 * 1000) { // Only restore if less than 5 mins old
          dispatch({ type: 'INIT_FROM_EDIT', payload: { items: cartState.items, globalDiscount: cartState.globalDiscount } });
          toast.success('Cart restored after app update');
        }
        localStorage.removeItem('ledgro-cart-recovery');
      } catch (e) {
        localStorage.removeItem('ledgro-cart-recovery');
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, shopId]);`
);

fs.writeFileSync('src/pages/POS.jsx', content);
