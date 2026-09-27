export const initialBillState = {
  items: [],
  globalDiscount: { type: 'flat', value: 0 },
};

// Generates a UUID for list reconciliation
const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
};

export function billReducer(state = initialBillState, action) {
  switch (action.type) {
    case 'ADD_ITEM': {
      const existingItemIndex = state.items.findIndex(
        (item) => item.name === action.payload.name && item.unitPrice === action.payload.unitPrice
      );

      if (existingItemIndex > -1) {
        // Increment quantity if exact item exists
        const newItems = [...state.items];
        newItems[existingItemIndex] = {
          ...newItems[existingItemIndex],
          qty: newItems[existingItemIndex].qty + (action.payload.qty || 1),
        };
        return { ...state, items: newItems };
      }

      // Add new item
      return {
        ...state,
        items: [
          ...state.items,
          {
            id: generateId(),
            name: action.payload.name,
            unitPrice: action.payload.unitPrice,
            qty: action.payload.qty || 1,
            lineDiscount: { type: 'flat', value: 0 },
            catalogId: action.payload.catalogId || null,
          },
        ],
      };
    }

    case 'UPDATE_QTY': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? { ...item, qty: action.payload.qty }
            : item
        ),
      };
    }

    case 'REMOVE_ITEM': {
      return {
        ...state,
        items: state.items.filter((item) => item.id !== action.payload.id)
      }
    }

    case 'SET_LINE_DISCOUNT': {
      return {
        ...state,
        items: state.items.map((item) =>
          item.id === action.payload.id
            ? { ...item, lineDiscount: action.payload.discount }
            : item
        ),
      };
    }

    case 'SET_GLOBAL_DISCOUNT': {
      return {
        ...state,
        globalDiscount: action.payload,
      };
    }

    case 'CLEAR_BILL': {
      return initialBillState;
    }

    case 'INIT_FROM_EDIT': {
      return {
        ...state,
        items: action.payload.items.map(item => ({
          ...item,
          id: generateId(), // ensure new UI IDs so editing works
          lineDiscount: item.lineDiscount || { type: 'flat', value: 0 }
        })),
        globalDiscount: action.payload.globalDiscount || { type: 'flat', value: 0 }
      };
    }

    default:
      return state;
  }
}

// Selectors for complex mathematical derivations
export const calculateBillTotals = (state) => {
  let subtotal = 0;

  const processedItems = state.items.map(item => {
    // 1. Raw total
    let rawTotal = item.unitPrice * item.qty;
    // 2. Round to nearest whole rupee BEFORE discount as per business logic requirement
    let roundedBaseTotal = Math.round(rawTotal);

    // 3. Apply line discount
    let discountAmt = 0;
    if (item.lineDiscount.type === 'percent') {
      discountAmt = (roundedBaseTotal * item.lineDiscount.value) / 100;
    } else {
      discountAmt = item.lineDiscount.value;
    }

    let finalLineTotal = Math.max(0, roundedBaseTotal - discountAmt);

    subtotal += finalLineTotal;

    return {
      ...item,
      rawTotal: roundedBaseTotal,
      discountAmt,
      finalLineTotal
    };
  });

  // Calculate global discount (everything is in paise)
  let globalDiscountAmt = 0;
  if (state.globalDiscount.type === 'percent') {
    globalDiscountAmt = Math.round((subtotal * state.globalDiscount.value) / 100);
  } else {
    globalDiscountAmt = state.globalDiscount.value; // Already in paise via UI
  }

  // Allocate global discount across line items using Largest Remainder Method
  let allocatedItems = [...processedItems];
  if (globalDiscountAmt > 0 && subtotal > 0) {
      const exact = processedItems.map(item => ({
        ...item,
        exactDiscount: (item.finalLineTotal / subtotal) * globalDiscountAmt
      }));

      allocatedItems = exact.map(item => ({
        ...item,
        allocatedGlobalDiscount: Math.floor(item.exactDiscount)
      }));

      const allocatedSum = allocatedItems.reduce((sum, item) => sum + item.allocatedGlobalDiscount, 0);
      let remainder = globalDiscountAmt - allocatedSum;

      const withFractions = allocatedItems
        .map((item, i) => ({ ...item, fraction: exact[i].exactDiscount - Math.floor(exact[i].exactDiscount), index: i }))
        .sort((a, b) => b.fraction - a.fraction);

      for (let i = 0; i < remainder; i++) {
        if(withFractions[i]) allocatedItems[withFractions[i].index].allocatedGlobalDiscount += 1;
      }

      allocatedItems = allocatedItems.map(item => ({
         ...item,
         finalLineTotal: Math.max(0, item.finalLineTotal - (item.allocatedGlobalDiscount || 0))
      }));
  }

  const grandTotal = Math.max(0, subtotal - globalDiscountAmt);

  return {
    items: allocatedItems,
    subtotal,
    globalDiscountAmt,
    grandTotal // already integer
  };
};
