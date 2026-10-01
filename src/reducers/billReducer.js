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
        (item) => item.name === action.payload.name && item.unitPriceAtSale === action.payload.unitPriceAtSale
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
            unitPriceAtSale: action.payload.unitPriceAtSale,
            catalogVersionTimestamp: action.payload.catalogVersionTimestamp || Date.now(),
            qty: action.payload.qty || 1,
            unit: action.payload.unit || 'unit',
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
export function allocateDiscount(lineItems, totalDiscountPaise) {
  if (!lineItems.length || totalDiscountPaise <= 0) return lineItems;

  const totalGross = lineItems.reduce((sum, item) => sum + (item.finalLineTotal || 0), 0);
  if (totalGross === 0) return lineItems;

  let distributedSum = 0;
  const itemsWithDiscount = lineItems.map((item) => {
    const exactShare = (item.finalLineTotal / totalGross) * totalDiscountPaise;
    const floorShare = Math.floor(exactShare);
    distributedSum += floorShare;
    return {
      ...item,
      allocatedDiscount: floorShare,
      fraction: exactShare - floorShare,
    };
  });

  let remainder = totalDiscountPaise - distributedSum;
  const sortedIndices = [...itemsWithDiscount.keys()].sort(
    (a, b) => itemsWithDiscount[b].fraction - itemsWithDiscount[a].fraction
  );

  for (let i = 0; i < remainder; i++) {
    itemsWithDiscount[sortedIndices[i]].allocatedDiscount += 1;
  }

  return itemsWithDiscount.map(({ fraction, ...item }) => item);
}

// Selectors for complex mathematical derivations
export const calculateBillTotals = (state) => {
  let subtotal = 0;

  let processedItems = state.items.map(item => {
    // 1. Raw total strictly in paise
    let rawTotalPaise = Math.round(item.unitPriceAtSale * item.qty);

    // 2. Apply line discount (ensure discount is in paise)
    let discountAmtPaise = 0;
    if (item.lineDiscount.type === 'percent') {
      discountAmtPaise = Math.round((rawTotalPaise * item.lineDiscount.value) / 100);
    } else {
      discountAmtPaise = Math.round(item.lineDiscount.value); // should already be in paise, but ensuring integer
    }

    let finalLineTotal = Math.max(0, rawTotalPaise - discountAmtPaise);

    subtotal += finalLineTotal;

    return {
      ...item,
      rawTotal: rawTotalPaise,
      discountAmt: discountAmtPaise,
      finalLineTotal
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
};
