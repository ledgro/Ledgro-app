import { forwardRef, useMemo } from 'react';
import { formatCurrency } from '../lib/utils';

// 58mm thermal paper: 384 dots across (203dpi). Rendered at this width, PDF is 58mm wide.
export const RECEIPT_PX = 384;

const Receipt = forwardRef(({ billData }, ref) => {
  const shopProfile = billData?.shopProfile || {};

  const { items = [], subtotal = 0, globalDiscountAmt = 0, grandTotal = 0, paymentMethod, shopName, createdAt, clientCreatedAt, payment } = billData || {};

  const dateStr = useMemo(() => {
    if (!billData) return '';
    if (clientCreatedAt) return new Date(clientCreatedAt).toLocaleString();
    if (createdAt && typeof createdAt.toDate === 'function') return createdAt.toDate().toLocaleString();
    if (createdAt) return new Date(createdAt).toLocaleString();
    return new Date().toLocaleString();
  }, [createdAt, clientCreatedAt, billData]);

  const billNo = useMemo(() => {
    if (!billData) return '';
    if (billData.billNo) return billData.billNo;
    if (billData.id) return billData.id;
    const arr = new Uint8Array(3);
    crypto.getRandomValues(arr);
    const suffix = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
    return `${new Date().toLocaleDateString('en-GB').replace(/\//g, '')}-${suffix}`;
  }, [billData?.billNo, billData?.id, billData]);

  if (!billData) return null;

  const finalShopName = shopName || shopProfile?.name || 'SHOP';
  const address = shopProfile?.address;
  const phone = shopProfile?.phone;
  const tagline = shopProfile?.tagline || 'Thank you for your purchase!';

  const mute = '#555555';
  const row = { display: 'flex', justifyContent: 'space-between', gap: '8px' };

  return (
    <div
      ref={ref}
      data-theme="light"
      aria-hidden="true"
      style={{
        width: `${RECEIPT_PX}px`,
        boxSizing: 'border-box',
        padding: '14px 12px',
        backgroundColor: '#ffffff',
        color: '#000000',
        fontFamily: 'Inter, "Noto Sans Malayalam", sans-serif',
        fontSize: '13px',
        lineHeight: 1.35,
        position: 'absolute',
        left: '-9999px',
        wordBreak: 'break-word'
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.2 }}>{finalShopName}</div>
        {address && <div style={{ fontSize: '11px', color: mute, marginTop: '3px' }}>{address}</div>}
        {phone && <div style={{ fontSize: '11px', color: mute }}>Ph: {phone}</div>}
        <div style={{ fontSize: '11px', color: mute, marginTop: '6px' }}>#{billNo}</div>
        <div style={{ fontSize: '11px', color: mute }}>{dateStr}</div>
      </div>

      <div style={{ borderTop: '1px dashed #999999', borderBottom: '1px dashed #999999', padding: '8px 0', marginBottom: '8px' }}>
        {items.map((item, i) => {
          const price = item.unitPriceAtSale ?? item.unitPrice ?? 0;
          const line = item.finalLineTotal ?? item.lineTotal ?? item.rawTotal;
          const unit = item.unit && item.unit !== 'unit' ? ` ${item.unit}` : '';
          return (
            <div key={i} style={{ marginBottom: i === items.length - 1 ? 0 : '7px' }}>
              <div style={{ fontWeight: 600 }}>{item.name || 'Item'}</div>
              <div style={{ ...row, fontSize: '12px', color: mute }}>
                <span>{item.qty || 1}{unit} x {formatCurrency(price)}</span>
                <span style={{ color: '#000000', fontWeight: 600 }}>
                  {item.rawTotal !== item.finalLineTotal && item.rawTotal != null && (
                    <s style={{ color: mute, fontWeight: 400, marginRight: '4px' }}>{formatCurrency(item.rawTotal)}</s>
                  )}
                  {formatCurrency(line)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ ...row, color: mute }}>
        <span>Subtotal</span>
        <span style={{ color: '#000000' }}>{formatCurrency(subtotal)}</span>
      </div>

      {globalDiscountAmt > 0 && (
        <div style={{ ...row, color: mute }}>
          <span>Discount</span>
          <span style={{ color: '#000000' }}>-{formatCurrency(globalDiscountAmt)}</span>
        </div>
      )}

      <div style={{ ...row, fontSize: '18px', fontWeight: 700, marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #000000' }}>
        <span>Total</span>
        <span>{formatCurrency(grandTotal)}</span>
      </div>

      <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '11px' }}>
        <div style={{ color: mute, marginBottom: '4px' }}>
          {payment?.method === 'split'
            ? `Paid: Cash ${formatCurrency(payment.breakdown?.cash)} + UPI ${formatCurrency(payment.breakdown?.upi)}`
            : `Paid via ${(paymentMethod || 'cash').toUpperCase()}`}
        </div>
        <div style={{ fontWeight: 700 }}>{tagline}</div>
      </div>
    </div>
  );
});

export default Receipt;
