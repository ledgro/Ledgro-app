// Plain data for the Terms of Service page. Keep punctuation simple: no long dashes.
// TODO: native speaker review of the Malayalam strings.
export const TERMS_VERSION = '2026-10-17';
export const TERMS_UPDATED = '17 October 2026';

export const termsTitle = { en: 'Terms of Service', ml: 'സേവന വ്യവസ്ഥകൾ' };

export const termsIntro = `These Terms are the agreement between you and Ledgro for using the Ledgro billing, ledger and expense app. By signing in you accept them and the Privacy Policy.`;

export const termsKeyPoints = {
  en: [
    'Ledgro is a record keeping tool. It is not an accountant, a bank or a tax advisor.',
    'Ledgro does not create GST invoices and does not process payments.',
    'You need an internet connection to save anything.',
    'Bills are not edited in place. You can void a bill, edit it (which replaces it with a new bill) or correct its payment method within 24 hours.',
    'Your records belong to you. You can export them and delete your account at any time.',
    'You are responsible for checking your cash, stock and totals.',
  ],
  ml: [
    'Ledgro ഒരു റെക്കോർഡ് സൂക്ഷിക്കുന്ന ടൂൾ ആണ്. അക്കൗണ്ടന്റോ ബാങ്കോ ടാക്സ് ഉപദേശകനോ അല്ല.',
    'Ledgro GST ഇൻവോയ്സുകൾ ഉണ്ടാക്കുന്നില്ല, പേയ്മെന്റുകൾ പ്രോസസ് ചെയ്യുന്നുമില്ല.',
    'എന്തെങ്കിലും സേവ് ചെയ്യാൻ ഇന്റർനെറ്റ് വേണം.',
    'ബില്ലുകൾ നേരിട്ട് തിരുത്തുന്നില്ല. 24 മണിക്കൂറിനുള്ളിൽ ബിൽ വോയ്ഡ് ചെയ്യാം, തിരുത്താം (പുതിയ ബിൽ ആയി മാറും), പേയ്മെന്റ് രീതി ശരിയാക്കാം.',
    'നിങ്ങളുടെ രേഖകൾ നിങ്ങളുടേതാണ്. എപ്പോൾ വേണമെങ്കിലും എക്സ്പോർട്ട് ചെയ്യാം, അക്കൗണ്ട് ഇല്ലാതാക്കാം.',
    'ക്യാഷ്, സ്റ്റോക്ക്, ആകെ തുകകൾ എന്നിവ ഒത്തുനോക്കേണ്ടത് നിങ്ങളുടെ ഉത്തരവാദിത്തമാണ്.',
  ],
};

export const termsSections = [
  {
    title: { en: 'Who can use Ledgro', ml: 'ആർക്കൊക്കെ ഉപയോഗിക്കാം' },
    blocks: [
      { ul: [
        'You must be 18 or older and able to enter into a contract.',
        'You need a Google account to sign in.',
        'Give true information about yourself and your shop, and do not pretend to be someone else.',
      ] },
    ],
  },
  {
    title: { en: 'Accounts, shops and roles', ml: 'അക്കൗണ്ട്, ഷോപ്പ്, റോളുകൾ' },
    blocks: [
      { p: `When you create a shop you become its owner. Others join with a one time invite code that the owner creates. A code works once and expires 30 minutes after it is created. Anyone who has the code during that time can join, so share it only with the person you mean to add.` },
      { ul: [
        'Owner: everything an admin can do, plus inviting and removing members, making members admins or members again, transferring ownership, and deleting the shop when they are its only member.',
        'Admin: edit shop details, delete products and expenses, void any bill within 24 hours, and read the shop\'s error reports.',
        'Member: make bills, record expenses and manage products. A member can void, edit or correct the payment of only their own bills, within 24 hours.',
      ] },
      { p: `You are responsible for everything done through your Google account and your shop. Lock your phone, keep your Google account secure, and remove anyone who should no longer have access.` },
    ],
  },
  {
    title: { en: 'What Ledgro is and is not', ml: 'Ledgro എന്താണ്, എന്തല്ല' },
    blocks: [
      { p: `Ledgro helps you record sales, returns, expenses, stock and cash, and see totals and reports. It is not an accountant, a bank, a payment service or a tax advisor. It does not move money or process payments. It records how a bill was paid, and it is not a bank statement.` },
      { note: `Check your cash, stock and totals against your real business regularly. We are not responsible for differences between what Ledgro shows and what you actually have, whether from a typing mistake, a missed bill, theft, a faulty phone or anything else.` },
    ],
  },
  {
    title: { en: 'GST and other taxes', ml: 'GST, മറ്റ് നികുതികൾ' },
    blocks: [
      { p: `Ledgro does not calculate GST and does not create tax invoices that meet GST law. You are responsible for your own tax records and filings.` },
    ],
  },
  {
    title: { en: 'You need internet to save', ml: 'സേവ് ചെയ്യാൻ ഇന്റർനെറ്റ് വേണം' },
    blocks: [
      { p: `Ledgro saves directly to its cloud database, so bills, returns, expenses, products and cash counts can only be saved while you are online.` },
      { ul: [
        'When you are offline, a banner appears and actions that save data are paused. Nothing is saved.',
        'Ledgro may still show information stored on your phone earlier. It can be out of date.',
        'A bill shows as saved only after the database confirms it. If the connection is slow you may see a message that the bill may still go through. Check Bill History before making the same bill again.',
      ] },
      { p: `We are not responsible for sales you could not record, or recorded twice, because of your network, phone or power supply. Keep a backup plan such as a paper bill book or a mobile hotspot.` },
    ],
  },
  {
    title: { en: 'Bills, returns, exchanges and cash counts', ml: 'ബില്ലുകൾ, റിട്ടേൺ, എക്സ്ചേഞ്ച്, ക്യാഷ് കൗണ്ട്' },
    blocks: [
      { ul: [
        'A saved bill cannot be deleted or changed in place. You can void it within 24 hours, as the member who made it or as an admin. A voided bill stays in your history, marked as voided, and its stock is put back.',
        'Editing a bill voids it and saves a new bill with a new number. You can also correct a bill\'s payment method within 24 hours. Neither is possible once items have been returned or exchanged.',
        'A return is saved as a separate entry with a negative amount, linked to the original bill, and returned items go back into stock. You cannot refund more than the original bill.',
        'An exchange saves a return and a new bill together. An exchange cannot be voided.',
        'A cash count records how much cash you counted and compares it with what Ledgro expected. It does not lock the day or change your sales or expenses.',
        'Stock numbers go down when you bill and up when you void or return, and you can change them by hand. Stock is a guide, not a legal record.',
      ] },
    ],
  },
  {
    title: { en: 'Staff records', ml: 'ജീവനക്കാരുടെ രേഖകൾ' },
    blocks: [
      { p: `Ledgro stores which member made each bill, expense and cash count, so that records can be trusted and the void rules work. It is not an attendance system or a tool for watching staff. If you add staff, you must tell them about this and follow the labour and privacy laws that apply to you as an employer.` },
    ],
  },
  {
    title: { en: 'Your data', ml: 'നിങ്ങളുടെ ഡാറ്റ' },
    blocks: [
      { p: `Everything you enter, such as bills, products, expenses and shop details, is yours. We do not claim ownership of it. You give us the right to store and process it only to run Ledgro for you.` },
      { ul: [
        'Export: you can export bills and expenses as PDF or PNG reports.',
        'Delete: you can delete your account from Settings. If you are the only member, this also deletes the shop and all its records permanently. If the shop has other members, make another member an admin first. Your access is then removed and the shop\'s records stay with the shop.',
        'How we handle personal data is described in the Privacy Policy.',
      ] },
    ],
  },
  {
    title: { en: 'Rules of use', ml: 'ഉപയോഗ നിയമങ്ങൾ' },
    blocks: [
      { p: `Do not:` },
      { ul: [
        'use Ledgro for anything illegal, or to record false or misleading information on purpose',
        'try to access another shop\'s data or get around Ledgro\'s security',
        'attack, overload, copy or reverse engineer the service',
        'share invite codes in public or add people to your shop without their knowledge',
      ] },
    ],
  },
  {
    title: { en: 'Availability, changes and price', ml: 'ലഭ്യത, മാറ്റങ്ങൾ, വില' },
    blocks: [
      { p: `We work to keep Ledgro running but cannot promise it will always be available, fast or error free. Maintenance, updates, internet problems or problems at Google or our hosting provider can interrupt it. We may add, change or remove features. When an update is ready the app may ask you to refresh, and it waits until you finish a sale.` },
      { p: `If we ever charge for any part of Ledgro, we will tell you in the app first, and you will not be charged unless you clearly agree.` },
    ],
  },
  {
    title: { en: 'Other companies\' services', ml: 'മറ്റ് കമ്പനികളുടെ സേവനങ്ങൾ' },
    blocks: [
      { p: `Ledgro relies on Google (Sign-In, Firebase Authentication and Cloud Firestore) and on Cloudflare for hosting. They have their own terms and privacy policies. We are not responsible for problems caused by them, but we will try to help you work around them.` },
    ],
  },
  {
    title: { en: 'No warranty and limits on liability', ml: 'ഉറപ്പുകളും ഉത്തരവാദിത്ത പരിധിയും' },
    blocks: [
      { p: `To the fullest extent the law allows, Ledgro is provided "as is" and "as available". We do not promise that it will meet every need of your business or that its totals will always be free from errors.` },
      { ul: [
        'We are not responsible for indirect losses such as lost profit, lost sales, lost data or tax penalties.',
        'We are not responsible for losses caused by your mistakes, your team\'s actions, someone using your account, your device or network, or events outside our control.',
        'If we are found responsible for a loss, our total liability is limited to the amount you paid us for Ledgro in the 12 months before the claim.',
      ] },
      { p: `Nothing here limits any responsibility that the law does not allow to be limited.` },
    ],
  },
  {
    title: { en: 'Ending your use', ml: 'ഉപയോഗം അവസാനിപ്പിക്കൽ' },
    blocks: [
      { p: `You can stop at any time by deleting your account in Settings. We may suspend or end your access if you break these Terms, put others or the service at risk, or the law requires it. Where we can, we will tell you why and let you export your records first. Parts of these Terms that are meant to continue, such as the limits on liability and the rules on disputes, continue after your account ends.` },
    ],
  },
  {
    title: { en: 'Changes to these Terms', ml: 'വ്യവസ്ഥകളിലെ മാറ്റങ്ങൾ' },
    blocks: [
      { p: `We may update these Terms when the app or the law changes. The date and version are shown on this page. For important changes we will ask you to accept again, and we record the version, date and language when you accept. If you do not accept the new Terms, stop using Ledgro and delete your account.` },
    ],
  },
  {
    title: { en: 'Governing law and contact', ml: 'ബാധകമായ നിയമം, ബന്ധപ്പെടാൻ' },
    blocks: [
      { p: `These Terms are governed by the laws of India. If you have a problem, write to getledgro@gmail.com first and we will try to solve it. If we cannot agree, the courts of India will decide. For privacy requests and complaints, see the Grievance section of the Privacy Policy.` },
    ],
  },
];
