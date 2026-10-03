import fs from 'fs';
let content = fs.readFileSync('src/reducers/billReducer.js', 'utf-8');
content = content.replace("export const calculateBillTotals = (state) => {", "export const calculateBillTotals = (state) => {\n  if (!state) return { items: [], subtotal: 0, globalDiscountAmt: 0, grandTotal: 0 };");
fs.writeFileSync('src/reducers/billReducer.js', content);
