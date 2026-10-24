import { forwardRef, useMemo } from 'react';
import { formatCurrency } from '../lib/utils';

// 58mm thermal paper: 384 dots across (203dpi). Rendered at this width, PDF is 58mm wide.
export const RECEIPT_PX = 384;

const Receipt = forwardRef(({ billData }, ref) => {
  const shopProfile = billData?.shopProfile || {};

  const { items = [], subtotal = 0, globalDiscountAmt = 0, grandTotal = 0, paymentMethod, shopName, createdAt, clientCreatedAt, payment, tendered, type } = billData || {};

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
  }, [billData]);

  if (!billData) return null;

  const finalShopName = shopName || shopProfile?.name || 'SHOP';
  const address = shopProfile?.address;
  const phone = shopProfile?.phone;
  const tagline = shopProfile?.tagline || 'Thank you for your purchase!';

  const isReturn = type === 'return';
  const totalQty = items.reduce((a, i) => a + (Number(i.qty) || 0), 0);
  const saved = (Number(globalDiscountAmt) || 0) + items.reduce((a, i) => a + (Number(i.lineDiscount) || 0), 0);
  const rupees = (p) => (Number(p || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const mute = '#555555';
  const cols = { display: 'flex', gap: '4px' };
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
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '20px', fontWeight: 700, lineHeight: 1.2 }}>{finalShopName}</div>
        {address && <div style={{ fontSize: '11px', color: mute, marginTop: '3px' }}>{address}</div>}
        {phone && <div style={{ fontSize: '11px', color: mute }}>Ph: {phone}</div>}
        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '2px', marginTop: '8px' }}>{isReturn ? 'RETURN RECEIPT' : 'CASH MEMO'}</div>
      </div>

      <div style={{ ...row, fontSize: '11px', color: mute, marginTop: '6px' }}>
        <span>Bill No: <b style={{ color: '#000' }}>{billNo}</b></span>
        <span>{dateStr}</span>
      </div>

      <div style={{ borderTop: '1px dashed #999999', marginTop: '8px' }} />
      <div style={{ ...cols, fontSize: '11px', fontWeight: 700, padding: '5px 0', borderBottom: '1px solid #000' }}>
        <span style={{ width: '18px' }}>#</span>
        <span style={{ flex: 1 }}>Item</span>
        <span style={{ width: '44px', textAlign: 'right' }}>Qty</span>
        <span style={{ width: '62px', textAlign: 'right' }}>Rate</span>
        <span style={{ width: '70px', textAlign: 'right' }}>Amount</span>
      </div>
      {items.map((item, i) => {
        const price = item.unitPriceAtSale ?? item.unitPrice ?? 0;
        const line = item.finalLineTotal ?? item.lineTotal ?? item.rawTotal;
        const unit = item.unit && item.unit !== 'unit' && item.unit !== 'piece' ? ` ${item.unit}` : '';
        const disc = item.lineDiscount > 0 ? item.lineDiscount : 0;
        return (
          <div key={i} style={{ padding: '5px 0', borderBottom: '1px dotted #cccccc' }}>
            <div style={{ ...cols, alignItems: 'flex-start' }}>
              <span style={{ width: '18px', color: mute, fontSize: '11px' }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: 600 }}>{item.name || 'Item'}</span>
              <span style={{ width: '44px', textAlign: 'right' }}>{item.qty || 1}{unit}</span>
              <span style={{ width: '62px', textAlign: 'right' }}>{rupees(price)}</span>
              <span style={{ width: '70px', textAlign: 'right', fontWeight: 600 }}>{rupees(item.rawTotal ?? line)}</span>
            </div>
            {disc > 0 && (
              <div style={{ ...row, fontSize: '11px', color: mute, paddingLeft: '18px' }}>
                <span>Item discount</span>
                <span>-{rupees(disc)}</span>
              </div>
            )}
          </div>
        );
      })}

      <div style={{ ...row, fontSize: '11px', color: mute, marginTop: '6px' }}>
        <span>{items.length} item{items.length === 1 ? '' : 's'}, qty {totalQty}</span>
      </div>
      <div style={{ ...row, color: mute, marginTop: '4px' }}>
        <span>Subtotal</span>
        <span style={{ color: '#000000' }}>{formatCurrency(subtotal)}</span>
      </div>
      {globalDiscountAmt > 0 && (
        <div style={{ ...row, color: mute }}>
          <span>Bill discount</span>
          <span style={{ color: '#000000' }}>-{formatCurrency(globalDiscountAmt)}</span>
        </div>
      )}
      <div style={{ ...row, fontSize: '19px', fontWeight: 700, marginTop: '6px', padding: '6px 0', borderTop: '1px solid #000', borderBottom: '1px solid #000' }}>
        <span>TOTAL</span>
        <span>{formatCurrency(grandTotal)}</span>
      </div>
      {saved > 0 && <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, marginTop: '6px' }}>You saved {formatCurrency(saved)}</div>}

      <div style={{ marginTop: '10px', fontSize: '12px' }}>
        {payment?.method === 'split' ? (
          <>
            <div style={{ ...row }}><span>Paid by Cash</span><span>{formatCurrency(payment.breakdown?.cash)}</span></div>
            <div style={{ ...row }}><span>Paid by UPI</span><span>{formatCurrency(payment.breakdown?.upi)}</span></div>
          </>
        ) : (
          <div style={{ ...row }}><span>Paid by {(paymentMethod || 'cash').toUpperCase()}</span><span>{formatCurrency(grandTotal)}</span></div>
        )}
        {tendered != null && tendered >= grandTotal && (
          <>
            <div style={{ ...row, color: mute }}><span>Cash received</span><span>{formatCurrency(tendered)}</span></div>
            <div style={{ ...row, color: mute }}><span>Change</span><span>{formatCurrency(tendered - grandTotal)}</span></div>
          </>
        )}
      </div>

      <div style={{ textAlign: 'center', marginTop: '14px', paddingTop: '8px', borderTop: '1px dashed #999999', fontSize: '12px', fontWeight: 700 }}>
        {tagline}
      </div>
    </div>
  );
});

export default Receipt;
