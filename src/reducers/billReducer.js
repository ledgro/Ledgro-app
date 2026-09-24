export const initialBillState = {
  items: [],
  globalDiscount: { type: 'flat', value: 0 },
};

// Generates a UUID for list reconciliation
const generateId = () => crypto.randomUUID();

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

  // Calculate global discount
  let globalDiscountAmt = 0;
  if (state.globalDiscount.type === 'percent') {
    globalDiscountAmt = (subtotal * state.globalDiscount.value) / 100;
  } else {
    globalDiscountAmt = state.globalDiscount.value;
  }

  const grandTotal = Math.max(0, subtotal - globalDiscountAmt);

  return {
    items: processedItems,
    subtotal,
    globalDiscountAmt,
    grandTotal: Math.round(grandTotal) // Final safeguard rounding
  };
};
