import fs from 'fs';

let content = `import { forwardRef, useMemo } from 'react';
import { formatCurrency } from '../lib/utils';
import { useAuth } from '../context/AuthContext'; // To pull shop profile

const Receipt = forwardRef(({ billData }, ref) => {
  // Use useAuth inside the component, but handle if it's called outside somehow
  let shopProfile = null;
  try {
    const authContext = useAuth();
    if (authContext) shopProfile = authContext.shop;
  } catch (e) {}

  if (!billData) return null;

  const { items = [], subtotal = 0, globalDiscountAmt = 0, grandTotal = 0, paymentMethod, shopName, createdAt, clientCreatedAt, payment } = billData;

  // 1. Fix date to be exact time of sale
  const dateStr = useMemo(() => {
    if (clientCreatedAt) return new Date(clientCreatedAt).toLocaleString();
    if (createdAt && typeof createdAt.toDate === 'function') return createdAt.toDate().toLocaleString();
    if (createdAt) return new Date(createdAt).toLocaleString();
    return new Date().toLocaleString();
  }, [createdAt, clientCreatedAt]);

  // 6. Fix fallback bill number stability
  const billNo = useMemo(() => {
    if (billData.billNo) return billData.billNo;
    if (billData.id) return billData.id;
    const arr = new Uint8Array(3);
    crypto.getRandomValues(arr);
    const suffix = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return \`\${new Date().toLocaleDateString('en-GB').replace(/\\//g, '')}-\${suffix}\`;
  }, [billData.billNo, billData.id]);

  // 7. Extract settings variables
  const finalShopName = shopName || shopProfile?.name || 'SHOP';
  const address = shopProfile?.address;
  const phone = shopProfile?.phone;
  const tagline = shopProfile?.tagline || 'Thank you for your purchase!';

  return (
    <div
      ref={ref}
      data-theme="light"
      aria-hidden="true"
      style={{
        width: '720px',
        padding: '32px',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Inter, "Noto Sans Malayalam", sans-serif',
        position: 'absolute',
        left: '-9999px',
        wordBreak: 'break-word'
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: '0 0 8px 0' }}>{finalShopName}</h1>
        {address && <p style={{ margin: '0 0 4px 0', fontSize: '18px', color: '#666666' }}>{address}</p>}
        {phone && <p style={{ margin: '0 0 12px 0', fontSize: '18px', color: '#666666' }}>Phone: {phone}</p>}

        <p style={{ margin: '12px 0 0 0', fontSize: '18px', color: '#666666' }}>Receipt #{billNo}</p>
        <p style={{ margin: '8px 0 0 0', fontSize: '16px', color: '#666666' }}>{dateStr}</p>
      </div>

      <div style={{ borderTop: '2px dashed #e5e5e5', borderBottom: '2px dashed #e5e5e5', padding: '16px 0', marginBottom: '20px' }}>
        <div style={{ display: 'flex', fontWeight: 'bold', fontSize: '18px', marginBottom: '12px' }}>
          <span style={{ flex: 2 }}>Item</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Qty</span>
          <span style={{ flex: 1, textAlign: 'right' }}>Total</span>
        </div>

        {items.map((item, i) => {
          // 4. Guard and format unit price
          const price = item.unitPriceAtSale ?? item.unitPrice ?? 0;

          return (
            <div key={i} style={{ display: 'flex', fontSize: '18px', marginBottom: '12px' }}>
              <div style={{ flex: 2 }}>
                <span style={{ display: 'block', fontWeight: '500' }}>{item.name || 'Item'}</span>
                <span style={{ fontSize: '14px', color: '#666666' }}>@ {formatCurrency(price)}</span>
              </div>
              <span style={{ flex: 1, textAlign: 'center' }}>{item.qty || 1} {item.unit !== 'unit' ? item.unit : ''}</span>
              <div style={{ flex: 1, textAlign: 'right' }}>
                {(item.rawTotal !== item.finalLineTotal) && (
                  <span style={{ textDecoration: 'line-through', fontSize: '14px', color: '#666666', display: 'block' }}>
                    {formatCurrency(item.rawTotal)}
                  </span>
                )}
                <span style={{ fontWeight: '600' }}>{formatCurrency(item.finalLineTotal ?? item.lineTotal ?? item.rawTotal)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', marginBottom: '8px' }}>
        <span style={{ color: '#666666' }}>Subtotal</span>
        <span style={{ fontWeight: '500' }}>{formatCurrency(subtotal)}</span>
      </div>

      {globalDiscountAmt > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', color: '#000000', marginBottom: '8px' }}>
          <span>Discount</span>
          <span style={{ fontWeight: '500' }}>-{formatCurrency(globalDiscountAmt)}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '24px', fontWeight: 'bold', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e5e5e5' }}>
        <span>Total</span>
        <span>{formatCurrency(grandTotal)}</span>
      </div>

      <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '16px' }}>
        {payment?.method === 'split' ? (
           <p style={{ margin: '0 0 8px 0', color: '#666666' }}>
             Paid via SPLIT (Cash: {formatCurrency(payment.breakdown?.cash)}, UPI: {formatCurrency(payment.breakdown?.upi)})
           </p>
        ) : (
           <p style={{ margin: '0 0 8px 0', color: '#666666' }}>
             Paid via {(paymentMethod || 'cash').toUpperCase()}
           </p>
        )}
        <p style={{ margin: '0', fontWeight: 'bold' }}>{tagline}</p>
      </div>
    </div>
  );
});

export default Receipt;
`;

fs.writeFileSync('src/components/Receipt.jsx', content);
