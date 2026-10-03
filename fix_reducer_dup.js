import fs from 'fs';
let content = fs.readFileSync('src/reducers/billReducer.js', 'utf-8');
const searchStr = `  };
};
  });

  // Calculate global discount (everything is in paise)
  let globalDiscountAmtPaise = 0;
  if (state.globalDiscount.type === 'percent') {
    globalDiscountAmtPaise = Math.round((subtotal * state.globalDiscount.value) / 100);
  } else {
    globalDiscountAmtPaise = Math.round(state.globalDiscount.value); // Already in paise via UI, but ensuring integer
  }

  // Allocate global discount across line items using Largest Remainder Method
  if (globalDiscountAmtPaise > 0 && subtotal > 0) {
    processedItems = allocateDiscount(processedItems, globalDiscountAmtPaise).map(item => ({
      ...item,
      allocatedGlobalDiscount: item.allocatedDiscount,
      finalLineTotal: Math.max(0, item.finalLineTotal - (item.allocatedDiscount || 0))
    }));
  }

  const grandTotal = Math.max(0, subtotal - globalDiscountAmtPaise);

  return {
    items: processedItems,
    subtotal,
    globalDiscountAmt: globalDiscountAmtPaise,
    grandTotal // already integer

  };
};`;
content = content.replace(searchStr, "  };\n};");
fs.writeFileSync('src/reducers/billReducer.js', content);
