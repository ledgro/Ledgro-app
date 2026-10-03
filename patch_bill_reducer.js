import fs from 'fs';

let content = fs.readFileSync('src/reducers/billReducer.js', 'utf-8');

// Fix 1: Tighten ADD_ITEM merge logic, INIT_FROM_EDIT, UPDATE_QTY
content = content.replace(
  /case 'ADD_ITEM': \{[\s\S]*?return \{ \.\.\.state, items: newItems \};\n      \}/,
  `case 'ADD_ITEM': {
      const payloadPrice = action.payload.unitPriceAtSale ?? action.payload.unitPrice;
      const existingItemIndex = state.items.findIndex(
        (item) => item.name === action.payload.name &&
                  (item.unitPriceAtSale ?? item.unitPrice) === payloadPrice &&
                  item.catalogId === (action.payload.catalogId || null) &&
                  item.unit === (action.payload.unit || 'unit')
      );

      if (existingItemIndex > -1) {
        // Increment quantity if exact item exists
        const newItems = [...state.items];
        newItems[existingItemIndex] = {
          ...newItems[existingItemIndex],
          qty: newItems[existingItemIndex].qty + (action.payload.qty || 1),
        };
        return { ...state, items: newItems };
      }`
);

content = content.replace(
  /case 'UPDATE_QTY': \{[\s\S]*?\},/s,
  `case 'UPDATE_QTY': {
      const newQty = Number(action.payload.qty);
      if (isNaN(newQty)) return state;

      if (newQty <= 0) {
        return {
          ...state,
          items: state.items.filter((item) => item.id !== action.payload.id)
        };
      }

      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? { ...item, qty: newQty }
            : item
        ),
      };
    }`
);

content = content.replace(
  /case 'INIT_FROM_EDIT': \{[\s\S]*?items: action\.payload\.items\.map\(item => \(\{/s,
  `case 'INIT_FROM_EDIT': {
      return {
        ...state,
        items: (action.payload.items || []).map(item => ({`
);


// Fix 2: Clamp discounts, handle NaN, fix output shape
const calcTotalsOld = /\/\/ Selectors for complex mathematical derivations\nexport const calculateBillTotals = \(state\) => \{[\s\S]*?\};/s;
const calcTotalsNew = `export const calculateBillTotals = (state) => {
  let subtotal = 0;

  let processedItems = state.items.map(item => {
    // 1. Raw total strictly in paise
    const price = item.unitPriceAtSale ?? item.unitPrice ?? 0;
    let rawTotalPaise = Math.round(price * (item.qty || 1));

    // 2. Apply line discount (ensure discount is in paise)
    let discountAmtPaise = 0;
    const lDiscType = item.lineDiscount?.type || 'flat';
    const lDiscValue = Number(item.lineDiscount?.value) || 0;

    if (lDiscType === 'percent') {
      const clampedPct = Math.min(Math.max(0, lDiscValue), 100);
      discountAmtPaise = Math.round((rawTotalPaise * clampedPct) / 100);
    } else {
      discountAmtPaise = Math.min(Math.max(0, Math.round(lDiscValue)), rawTotalPaise);
    }

    let finalLineTotal = Math.max(0, rawTotalPaise - discountAmtPaise);
    subtotal += finalLineTotal;

    return {
      ...item,
      unitPriceAtSale: price, // Ensure this exists on the output object as it's required by POS
      rawTotal: rawTotalPaise,
      discountAmt: discountAmtPaise,
      finalLineTotal
    };
  });

  // Calculate global discount (everything is in paise)
  let globalDiscountAmtPaise = 0;
  const gDiscType = state.globalDiscount?.type || 'flat';
  const gDiscValue = Number(state.globalDiscount?.value) || 0;

  if (gDiscType === 'percent') {
    const clampedPct = Math.min(Math.max(0, gDiscValue), 100);
    globalDiscountAmtPaise = Math.round((subtotal * clampedPct) / 100);
  } else {
    globalDiscountAmtPaise = Math.min(Math.max(0, Math.round(gDiscValue)), subtotal);
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

content = content.replace(calcTotalsOld, calcTotalsNew);

fs.writeFileSync('src/reducers/billReducer.js', content);
