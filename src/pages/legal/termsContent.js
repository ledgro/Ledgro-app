// Plain data for the Terms of Service page. Keep punctuation simple: no long dashes.
// TODO: native speaker review of the Malayalam strings.
export const TERMS_VERSION = '2026-10';
export const TERMS_UPDATED = '8 October 2026';

export const termsTitle = { en: 'Terms of Service', ml: 'സേവന വ്യവസ്ഥകൾ' };

export const termsIntro = `These Terms explain the rules for using Ledgro, a billing, ledger and expense tool for small shops. They are written in plain language on purpose. Please read them once, slowly, before you start. They are an agreement between you and Ledgro.`;

export const termsKeyPoints = {
  en: [
    'Ledgro is a record keeping tool. It is not an accountant, a bank or a tax advisor.',
    'Ledgro does not make GST invoices. It is for small shops that do not need to register for GST.',
    'You need internet to save anything. If you are offline, nothing is saved.',
    'Saved bills cannot be edited or deleted. You can void a bill within 24 hours.',
    'Your records belong to you. You can export them and delete your account at any time.',
    'Check your cash, stock and totals against your real shop often. You are responsible for your own records.',
  ],
  ml: [
    'Ledgro ഒരു റെക്കോർഡ് സൂക്ഷിക്കുന്ന ടൂൾ ആണ്. അക്കൗണ്ടന്റോ ബാങ്കോ ടാക്സ് ഉപദേശകനോ അല്ല.',
    'Ledgro GST ഇൻവോയ്സുകൾ ഉണ്ടാക്കുന്നില്ല. GST രജിസ്ട്രേഷൻ ആവശ്യമില്ലാത്ത ചെറിയ കടകൾക്കുള്ളതാണ് ഇത്.',
    'എന്തെങ്കിലും സേവ് ചെയ്യാൻ ഇന്റർനെറ്റ് വേണം. ഓഫ്‌ലൈൻ ആണെങ്കിൽ ഒന്നും സേവ് ആകില്ല.',
    'സേവ് ചെയ്ത ബില്ലുകൾ തിരുത്താനോ മായ്ക്കാനോ കഴിയില്ല. 24 മണിക്കൂറിനുള്ളിൽ ബിൽ വോയ്ഡ് ചെയ്യാം.',
    'നിങ്ങളുടെ രേഖകൾ നിങ്ങളുടേതാണ്. എപ്പോൾ വേണമെങ്കിലും എക്സ്പോർട്ട് ചെയ്യാം, അക്കൗണ്ട് ഇല്ലാതാക്കാം.',
    'നിങ്ങളുടെ ക്യാഷ്, സ്റ്റോക്ക്, ആകെ തുകകൾ എന്നിവ കടയിലെ യഥാർത്ഥ കണക്കുമായി ഇടയ്ക്കിടെ ഒത്തുനോക്കുക.',
  ],
};

export const termsSections = [
  {
    title: { en: 'About these Terms', ml: 'ഈ വ്യവസ്ഥകളെക്കുറിച്ച്' },
    blocks: [
      { p: `These Terms of Service ("Terms") explain the rules for using Ledgro. They are an agreement between you and Ledgro ("we", "us", "our").` },
      { p: `By ticking the box on the sign in screen and using Ledgro, you confirm that you have read these Terms and our Privacy Policy, and that you accept them. If you do not accept them, please do not use Ledgro.` },
      { p: `Ledgro is a web app. You open it in the browser on your phone or computer, and you can add it to your home screen. It is not a bank, a payment app or an accounting firm.` },
    ],
  },
  {
    title: { en: 'Who can use Ledgro', ml: 'ആർക്കൊക്കെ ഉപയോഗിക്കാം' },
    blocks: [
      { ul: [
        'You must be at least 18 years old and able to make a binding agreement under Indian law.',
        'You need a Google account to sign in. Ledgro does not have its own passwords.',
        'If you use Ledgro for a business, you confirm that you own that business, or that the owner has allowed you to use Ledgro for it.',
        'You must give true information about yourself and your shop, and you must not pretend to be someone else.',
      ] },
    ],
  },
  {
    title: { en: 'Your account, your shop and your team', ml: 'നിങ്ങളുടെ അക്കൗണ്ട്, കട, ടീം' },
    blocks: [
      { p: `When you create a shop, you become its admin. Other people can join your shop as members, using a one time invite code that you create.` },
      { h: 'Roles' },
      { ul: [
        'Admin: can add and remove members, change shop details, make other members admins, delete products, delete expenses, void any bill within 24 hours, and close the shop when they are its only member.',
        'Member: can make bills, record expenses, add products, change stock counts, save cash counts, and void their own bills within 24 hours.',
      ] },
      { h: 'Invite codes' },
      { p: `An invite code works only once and expires 30 minutes after it is created. Share it only with the person you want to add, through a channel you trust. Anyone who has the code during that time can join your shop, so treat it like a key.` },
      { h: 'Staying signed in' },
      { p: `For your safety, Ledgro signs you out automatically after 3 days. You can sign in again with your Google account.` },
      { h: 'Keeping your account safe' },
      { p: `You are responsible for everything done through your Google account and your shop. Do not leave your phone unlocked at the counter and do not share your Google password. If you think someone else has got access, remove them from the Members screen and change your Google password straight away.` },
    ],
  },
  {
    title: { en: 'What Ledgro does and does not do', ml: 'Ledgro എന്ത് ചെയ്യും, എന്ത് ചെയ്യില്ല' },
    blocks: [
      { p: `Ledgro helps you make bills, keep a ledger of sales, record expenses, track products and stock, count the cash in your drawer, and see simple totals for the day, week and month.` },
      { p: `Ledgro is a record keeping tool. It does not give accounting, auditing, legal or tax advice, and it is not a replacement for a chartered accountant, a tax professional or a lawyer. Every total and report is only as correct as the information that was entered into the app.` },
      { note: `Please check your cash, your stock and your totals against your real shop often. We are not responsible for a difference between what Ledgro shows and what is physically in your shop, whether it comes from a typing mistake, a missed bill, theft, a faulty phone or anything else.` },
    ],
  },
  {
    title: { en: 'GST and other taxes', ml: 'GST, മറ്റ് നികുതികൾ' },
    blocks: [
      { p: `Ledgro does not calculate GST and does not create tax invoices that meet GST law. It is made for small shops that are not required to register for GST.` },
      { p: `At the time of writing, a business that sells only goods must generally register for GST when its yearly turnover goes above ₹40 lakh, and a business that provides services must generally register above ₹20 lakh. Lower limits apply in some states and in some situations, and the rules can change. You must check the current rules for your own business with a tax professional.` },
      { p: `If you need to register for GST, or you are already registered, you must use proper GST invoicing software for your tax invoices. Issuing plain bills from Ledgro when you should be issuing GST invoices is your responsibility, together with any tax, interest or penalty that follows.` },
    ],
  },
  {
    title: { en: 'You need internet to save', ml: 'സേവ് ചെയ്യാൻ ഇന്റർനെറ്റ് വേണം' },
    blocks: [
      { p: `Ledgro saves your work straight to our cloud database. This means bills, returns, expenses, products and cash counts can only be saved while your phone is online.` },
      { ul: [
        'If you go offline, a red banner appears at the top of the screen and actions that save data are paused. Nothing is saved while you are offline.',
        'Ledgro may still open and show information it kept on your phone earlier, but that information can be out of date.',
        'When you make a bill, Ledgro shows success only after our database confirms it. If the connection is slow, you may see a message saying the bill may still go through. In that case, open Bill History and check before making the same bill again, so that it is not recorded twice.',
        'Keep a backup plan for power cuts and network problems, such as a paper bill book or a mobile hotspot.',
      ] },
      { p: `We are not responsible for sales you could not record, or recorded twice, because of your network, your phone or your power supply.` },
    ],
  },
  {
    title: { en: 'Bills, returns, voids and cash counts', ml: 'ബില്ലുകൾ, റിട്ടേണുകൾ, വോയ്ഡ്, ക്യാഷ് കൗണ്ട്' },
    blocks: [
      { p: `Ledgro is built so that your sales history stays trustworthy.` },
      { ul: [
        'A saved bill cannot be edited or deleted. If a bill was a mistake, you can void it. Voiding is allowed only within 24 hours of the bill being made, and only by the person who made it or by an admin. A voided bill stays in your history, marked as voided, and its stock is put back.',
        'Editing a bill in the app works by voiding the old bill and saving a new bill in its place.',
        'A return is saved as its own entry with a negative amount, linked to the original bill. You cannot refund more than the original bill total, and returned items go back into stock.',
        'A cash count lets you type how much cash is really in the drawer and compares it with what Ledgro expected. You can save a new count as many times as you like, and the latest count for the day is the one kept. A cash count does not lock the day, and it does not change your sales or your expenses. It is a note for you.',
        'Stock numbers go down when you make a bill and go up when you void or return. You can also change them by hand on the Products screen. Stock is a helpful guide, not a legal record.',
      ] },
    ],
  },
  {
    title: { en: 'Staff and labour laws', ml: 'ജീവനക്കാരും തൊഴിൽ നിയമങ്ങളും' },
    blocks: [
      { p: `Ledgro stores which member made each bill, expense and cash count. This is kept so that records can be trusted and so that the void rules work. It is not a time clock, an attendance record or a tool for watching staff, and it does not replace anything you must keep under the Kerala Shops and Commercial Establishments Act, 1960, or any other labour law.` },
      { p: `If you add staff to your shop, you are the one who must tell them that Ledgro stores which member made each entry, and you must follow the labour and privacy laws that apply to you as an employer.` },
    ],
  },
  {
    title: { en: 'Your data belongs to you', ml: 'നിങ്ങളുടെ ഡാറ്റ നിങ്ങളുടേതാണ്' },
    blocks: [
      { p: `Everything you put into Ledgro, such as your bills, products, expenses and shop details, is yours. We do not claim ownership of it.` },
      { p: `You give us permission to store, process and show this data back to you and your team, only so that Ledgro can work. This permission ends when your data is deleted.` },
      { ul: [
        'Export: you can export your bills and expenses as PDF or PNG reports from Settings, and your bill history from the Bill History screen, at any time and at no charge.',
        'Delete: you can delete your account from Settings. If you are the only member of your shop, deleting your account also closes the shop and permanently deletes all of its records. If other members exist, you must first make another member an admin. Then only your own access is removed.',
        'No lock in: we will not hold your data back or charge you to get it out.',
      ] },
    ],
  },
  {
    title: { en: 'Rules of use', ml: 'ഉപയോഗത്തിന്റെ നിയമങ്ങൾ' },
    blocks: [
      { p: `Please use Ledgro honestly and with care. You agree not to:` },
      { ul: [
        'enter false, misleading or illegal records, or use Ledgro to hide or help with illegal activity such as tax evasion or money laundering',
        'try to get into another shop\'s data, or to get around the security of Ledgro',
        'attack, overload, copy or reverse engineer the app, or use bots or scripts to use it in ways it was not meant for',
        'upload malicious code or anything that harms the app or other users',
        'share invite codes in public, or add people to your shop without their knowledge',
        'use Ledgro in any way that breaks the law',
      ] },
    ],
  },
  {
    title: { en: 'Availability, updates and changes to the app', ml: 'ലഭ്യത, അപ്ഡേറ്റുകൾ' },
    blocks: [
      { p: `We work to keep Ledgro running, but we cannot promise that it will always be available, fast or free of errors. The service can be interrupted by maintenance, updates, internet problems, or problems at Google or our hosting provider.` },
      { p: `We may add, change or remove features to improve Ledgro. When an update is ready, the app may ask you to refresh. If you are in the middle of a sale, it waits until you have finished.` },
    ],
  },
  {
    title: { en: 'Price', ml: 'വില' },
    blocks: [
      { p: `If we charge for any part of Ledgro, we will tell you in the app before it changes, and you will never be charged unless you clearly agree to it.` },
    ],
  },
  {
    title: { en: 'Other companies\' services', ml: 'മറ്റ് കമ്പനികളുടെ സേവനങ്ങൾ' },
    blocks: [
      { p: `Ledgro depends on services from other companies. They have their own terms and privacy policies.` },
      { ul: [
        'Google Sign-In and Google Firebase (Authentication and Cloud Firestore), for signing you in and storing your data.',
        'Google Fonts, which supplies the font used for the Ledgro name.',
        'A web hosting provider, which delivers the app to your device.',
      ] },
      { p: `We are not responsible for problems caused by these services, but we will try to help you work around them.` },
    ],
  },
  {
    title: { en: 'No warranty', ml: 'ഉറപ്പുകളില്ല' },
    blocks: [
      { p: `To the fullest extent the law allows, Ledgro is provided "as is" and "as available". We do not promise that it will meet every need of your business, that its totals will always be free from errors, or that it will work without interruption.` },
    ],
  },
  {
    title: { en: 'Limits on our responsibility', ml: 'ഞങ്ങളുടെ ഉത്തരവാദിത്തത്തിന്റെ പരിധി' },
    blocks: [
      { p: `To the fullest extent the law allows:` },
      { ul: [
        'We are not responsible for indirect or knock on losses, such as lost profit, lost sales, lost data, loss of goodwill or tax penalties.',
        'We are not responsible for losses caused by your mistakes, your team\'s actions, someone using your account, your device, your network, or events outside our control.',
        'If we are found responsible for a loss, our total liability to you is limited to the amount you paid us for Ledgro in the 12 months before the claim.',
      ] },
      { p: `Nothing in these Terms limits any responsibility that the law does not allow to be limited.` },
    ],
  },
  {
    title: { en: 'Ending your use', ml: 'ഉപയോഗം അവസാനിപ്പിക്കൽ' },
    blocks: [
      { p: `You can stop using Ledgro at any time by deleting your account in Settings.` },
      { p: `We may suspend or end your access if you break these Terms, if you put other people or the service at risk, or if the law requires it. Where we can, we will tell you why, and give you a chance to export your records first.` },
      { p: `When an account or shop is deleted, the parts of these Terms that are meant to carry on, such as the limits on responsibility and the rules about disputes, continue to apply.` },
    ],
  },
  {
    title: { en: 'Changes to these Terms', ml: 'വ്യവസ്ഥകളിലെ മാറ്റങ്ങൾ' },
    blocks: [
      { p: `We may update these Terms from time to time, for example when the app changes or the law changes. The date and version are shown on this page. If a change is important, we will tell you in the app and ask you to accept again. When you accept, we record the version, the date and the language you used.` },
      { p: `If you keep using Ledgro after a change, you accept the new Terms. If you do not accept them, please stop using Ledgro and delete your account.` },
    ],
  },
  {
    title: { en: 'Governing law and disputes', ml: 'ബാധകമായ നിയമം, തർക്കങ്ങൾ' },
    blocks: [
      { p: `These Terms are governed by the laws of India. If you have a problem, please write to us first at support@ledgro.in and we will try honestly to solve it. If we cannot agree, the courts of India will decide the matter.` },
    ],
  },
  {
    title: { en: 'Contact', ml: 'ബന്ധപ്പെടാൻ' },
    blocks: [
      { p: `Questions about these Terms? Write to support@ledgro.in. For privacy requests and complaints, see the Grievance section of our Privacy Policy.` },
    ],
  },
];
