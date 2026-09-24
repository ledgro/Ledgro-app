import React, { forwardRef } from 'react';

const Receipt = forwardRef(({ billData }, ref) => {
  if (!billData) return null;

  const { items, subtotal, globalDiscountAmt, grandTotal, paymentMethod, shopName } = billData;
  const dateStr = new Date().toLocaleString();

  // Use billNo from billData if present, otherwise fallback to generating it securely
  const billNo = billData.billNo || (() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const suffix = Array.from(crypto.getRandomValues(new Uint8Array(4)))
      .map(b => chars[b % chars.length]).join('');
    return `${new Date().toLocaleDateString('en-GB').replace(/\//g, '')}-${suffix}`;
  })();

  // Using raw hex codes to bypass Tailwind v4 oklch canvas bug
  return (
    <div
      ref={ref}
      style={{
        width: '384px',
        padding: '24px',
        backgroundColor: '#FFFFFF',
        color: '#000000',
        fontFamily: 'monospace',
        position: 'absolute',
        left: '-9999px' // hidden offscreen
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 8px 0' }}>{shopName || 'LEDGRO SHOP'}</h1>
        <p style={{ margin: '0', fontSize: '14px', color: '#4B5563' }}>Receipt #{billNo}</p>
        <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#4B5563' }}>{dateStr}</p>
      </div>

      <div style={{ borderTop: '1px dashed #D1D5DB', borderBottom: '1px dashed #D1D5DB', padding: '12px 0', marginBottom: '16px' }}>
        <div style={{ display: 'flex', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
          <span style={{ flex: 2 }}>Item</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Qty</span>
          <span style={{ flex: 1, textAlign: 'right' }}>Total</span>
        </div>

        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', fontSize: '14px', marginBottom: '8px' }}>
            <div style={{ flex: 2 }}>
              <span style={{ display: 'block' }}>{item.name}</span>
              <span style={{ fontSize: '12px', color: '#6B7280' }}>@ ₹{item.unitPrice}</span>
            </div>
            <span style={{ flex: 1, textAlign: 'center' }}>{item.qty}</span>
            <div style={{ flex: 1, textAlign: 'right' }}>
              {item.lineDiscount?.value > 0 && (
                <span style={{ textDecoration: 'line-through', fontSize: '12px', color: '#9CA3AF', display: 'block' }}>
                  ₹{item.rawTotal}
                </span>
              )}
              <span>₹{item.finalLineTotal}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginBottom: '4px' }}>
        <span>Subtotal</span>
        <span>₹{subtotal}</span>
      </div>

      {globalDiscountAmt > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', color: '#DC2626', marginBottom: '4px' }}>
          <span>Discount</span>
          <span>-₹{globalDiscountAmt}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: 'bold', marginTop: '12px', paddingTop: '12px', borderTop: '2px solid #000000' }}>
        <span>Total</span>
        <span>₹{grandTotal}</span>
      </div>

      <div style={{ textAlign: 'center', marginTop: '32px', fontSize: '14px' }}>
        <p style={{ margin: '0 0 4px 0' }}>Paid via {paymentMethod.toUpperCase()}</p>
        <p style={{ margin: '0', fontWeight: 'bold' }}>Thank you for your purchase!</p>
      </div>
    </div>
  );
});

export default Receipt;
