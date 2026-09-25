import React, { forwardRef } from 'react';

const Receipt = forwardRef(({ billData }, ref) => {
  if (!billData) return null;

  const { items, subtotal, globalDiscountAmt, grandTotal, paymentMethod, shopName } = billData;
  const dateStr = new Date().toLocaleString();

  // Use billNo from billData if present, otherwise fallback to generating it securely
  const billNo = billData.billNo || billData.id || (() => {
    const arr = new Uint8Array(3);
    crypto.getRandomValues(arr);
    const suffix = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${new Date().toLocaleDateString('en-GB').replace(/\//g, '')}-${suffix}`;
  })();

  return (
    <div
      ref={ref}
      data-theme="light"
      style={{
        width: '720px',
        padding: '32px',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Inter, sans-serif',
        position: 'absolute',
        left: '-9999px' // hidden offscreen
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: '0 0 12px 0' }}>{shopName || 'LEDGRO SHOP'}</h1>
        <p style={{ margin: '0', fontSize: '18px', color: '#666666' }}>Receipt #{billNo}</p>
        <p style={{ margin: '8px 0 0 0', fontSize: '16px', color: '#666666' }}>{dateStr}</p>
      </div>

      <div style={{ borderTop: '2px dashed #e5e5e5', borderBottom: '2px dashed #e5e5e5', padding: '16px 0', marginBottom: '20px' }}>
        <div style={{ display: 'flex', fontWeight: 'bold', fontSize: '18px', marginBottom: '12px' }}>
          <span style={{ flex: 2 }}>Item</span>
          <span style={{ flex: 1, textAlign: 'center' }}>Qty</span>
          <span style={{ flex: 1, textAlign: 'right' }}>Total</span>
        </div>

        {items.map((item, i) => (
          <div key={i} style={{ display: 'flex', fontSize: '18px', marginBottom: '12px' }}>
            <div style={{ flex: 2 }}>
              <span style={{ display: 'block', fontWeight: '500' }}>{item.name}</span>
              <span style={{ fontSize: '14px', color: '#666666' }}>@ ₹{item.unitPrice}</span>
            </div>
            <span style={{ flex: 1, textAlign: 'center' }}>{item.qty}</span>
            <div style={{ flex: 1, textAlign: 'right' }}>
              {item.lineDiscount?.value > 0 && (
                <span style={{ textDecoration: 'line-through', fontSize: '14px', color: '#666666', display: 'block' }}>
                  ₹{item.rawTotal}
                </span>
              )}
              <span style={{ fontWeight: '600' }}>₹{item.finalLineTotal}</span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', marginBottom: '8px' }}>
        <span style={{ color: '#666666' }}>Subtotal</span>
        <span style={{ fontWeight: '500' }}>₹{subtotal}</span>
      </div>

      {globalDiscountAmt > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', color: '#000000', marginBottom: '8px' }}>
          <span>Discount</span>
          <span style={{ fontWeight: '500' }}>-₹{globalDiscountAmt}</span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '24px', fontWeight: 'bold', marginTop: '16px', paddingTop: '16px', borderTop: '2px solid #e5e5e5' }}>
        <span>Total</span>
        <span>₹{grandTotal}</span>
      </div>

      <div style={{ textAlign: 'center', marginTop: '40px', fontSize: '16px' }}>
        <p style={{ margin: '0 0 8px 0', color: '#666666' }}>Paid via {paymentMethod.toUpperCase()}</p>
        <p style={{ margin: '0', fontWeight: 'bold' }}>Thank you for your purchase!</p>
      </div>
    </div>
  );
});

export default Receipt;
