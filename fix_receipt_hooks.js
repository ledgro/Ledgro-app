import fs from 'fs';
let content = fs.readFileSync('src/components/Receipt.jsx', 'utf-8');

const hookFix = `const Receipt = forwardRef(({ billData }, ref) => {
  // Use useAuth inside the component, but handle if it's called outside somehow
  let shopProfile = null;
  const authContext = useAuth(); // React rules require hooks at the top unconditionally
  if (authContext) shopProfile = authContext.shop;

  const { items = [], subtotal = 0, globalDiscountAmt = 0, grandTotal = 0, paymentMethod, shopName, createdAt, clientCreatedAt, payment } = billData || {};

  // 1. Fix date to be exact time of sale
  const dateStr = useMemo(() => {
    if (!billData) return '';
    if (clientCreatedAt) return new Date(clientCreatedAt).toLocaleString();
    if (createdAt && typeof createdAt.toDate === 'function') return createdAt.toDate().toLocaleString();
    if (createdAt) return new Date(createdAt).toLocaleString();
    return new Date().toLocaleString();
  }, [createdAt, clientCreatedAt, billData]);

  // 6. Fix fallback bill number stability
  const billNo = useMemo(() => {
    if (!billData) return '';
    if (billData.billNo) return billData.billNo;
    if (billData.id) return billData.id;
    const arr = new Uint8Array(3);
    crypto.getRandomValues(arr);
    const suffix = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return \`\${new Date().toLocaleDateString('en-GB').replace(/\\//g, '')}-\${suffix}\`;
  }, [billData?.billNo, billData?.id, billData]);

  if (!billData) return null;`;

content = content.replace(/const Receipt = forwardRef\(\(\{ billData \}, ref\) => \{[\s\S]*?if \(\!billData\) return null;/s, hookFix);

fs.writeFileSync('src/components/Receipt.jsx', content);
