// Plain data for the Privacy Policy page. Keep punctuation simple: no long dashes.
// TODO: native speaker review of the Malayalam strings.
export const PRIVACY_VERSION = '2026-10-17';
export const PRIVACY_UPDATED = '17 October 2026';

export const privacyTitle = { en: 'Privacy Policy', ml: 'സ്വകാര്യതാ നയം' };

export const privacyIntro = `This policy explains what personal data Ledgro collects, why, who can see it, how long it is kept, and the control you have. It describes what the app actually does.`;

export const privacyKeyPoints = {
  en: [
    'We collect only what Ledgro needs: your Google account details, your shop details and the records you enter.',
    'We do not sell your data, show ads, or use advertising or analytics trackers.',
    'Ledgro has no place to enter your customers\' names or phone numbers.',
    'Your records are stored in a database located in India, with Google Firebase. Only members of your shop can see them.',
    'You can export your records and delete your account from Settings.',
  ],
  ml: [
    'Ledgro പ്രവർത്തിക്കാൻ ആവശ്യമായ വിവരങ്ങൾ മാത്രമേ ശേഖരിക്കൂ: ഗൂഗിൾ അക്കൗണ്ട് വിവരങ്ങൾ, ഷോപ്പ് വിവരങ്ങൾ, നിങ്ങൾ രേഖപ്പെടുത്തുന്ന കണക്കുകൾ.',
    'ഞങ്ങൾ ഡാറ്റ വിൽക്കുന്നില്ല, പരസ്യങ്ങൾ കാണിക്കുന്നില്ല, പരസ്യ-അനലിറ്റിക്സ് ട്രാക്കറുകൾ ഉപയോഗിക്കുന്നില്ല.',
    'ഉപഭോക്താക്കളുടെ പേരോ ഫോൺ നമ്പറോ നൽകാനുള്ള സൗകര്യം Ledgro-യിൽ ഇല്ല.',
    'നിങ്ങളുടെ രേഖകൾ ഇന്ത്യയിലുള്ള ഡാറ്റാബേസിൽ, ഗൂഗിൾ ഫയർബേസിൽ, സൂക്ഷിക്കുന്നു. ഷോപ്പിലെ അംഗങ്ങൾക്ക് മാത്രമേ അവ കാണാൻ കഴിയൂ.',
    'സെറ്റിംഗ്സിൽ നിന്ന് രേഖകൾ എക്സ്പോർട്ട് ചെയ്യാം, അക്കൗണ്ട് ഇല്ലാതാക്കാം.',
  ],
};

export const privacySections = [
  {
    title: { en: 'Who we are', ml: 'ഞങ്ങൾ ആരാണ്' },
    blocks: [
      { p: `Ledgro is a billing, ledger and expense app. Ledgro decides why and how the personal data described here is used, so it is the "data fiduciary" under the Digital Personal Data Protection Act, 2023 (DPDP Act). You are the "data principal".` },
      { p: `Contact: support@ledgro.in` },
    ],
  },
  {
    title: { en: 'What we collect', ml: 'ഞങ്ങൾ ശേഖരിക്കുന്നത്' },
    blocks: [
      { h: 'Account' },
      { p: `Your Google account name, email address and profile picture link, and a unique user ID. We never see your Google password.` },
      { h: 'Consent record' },
      { p: `The version of the Terms and this policy you accepted, the language shown, and the time.` },
      { h: 'Shop' },
      { p: `Shop name, and the address, phone number and tagline if you add them. The list of members and their roles. Each member's display name, which every member of the shop can see. Invite codes with their expiry and who used them.` },
      { h: 'Records you enter' },
      { ul: [
        'Bills, returns and exchanges: items, quantities, prices, discounts, totals, payment method (cash, UPI or split), bill number, time, and which member made it.',
        'Expenses: amount, category, note, payment method, time, and which member recorded it.',
        'Products and stock, and stock transfers between shops.',
        'Daily cash counts.',
      ] },
      { h: 'Error reports' },
      { p: `If the app hits an error, it may save a short report to your shop: the error message, a technical trace, the screen name, your user ID and the time. Only the shop admin can read these reports. The app sends a limited number per session.` },
      { h: 'Technical data' },
      { p: `Google and our hosting provider receive your IP address, device and browser type and request logs when your device connects. They use this to run and secure their services.` },
    ],
  },
  {
    title: { en: 'What we do not collect', ml: 'ഞങ്ങൾ ശേഖരിക്കാത്തത്' },
    blocks: [
      { ul: [
        'Customer names, phone numbers or addresses.',
        'Your contacts, photos, files, camera, microphone or location.',
        'Card numbers, bank account numbers or UPI PINs. Ledgro records how a bill was paid but does not process payments.',
        'Advertising identifiers. There are no ads and no analytics or advertising trackers.',
      ] },
    ],
  },
  {
    title: { en: 'How we use your data', ml: 'ഡാറ്റ ഉപയോഗിക്കുന്നത്' },
    blocks: [
      { p: `Only to run Ledgro for you:` },
      { ul: [
        'to sign you in and keep you signed in for up to 3 days',
        'to save your records and show them to you and your team',
        'to calculate totals and reports',
        'to keep each shop separate and secure, and to find and fix errors',
        'to keep proof of your consent',
        'to answer support requests and complaints, and to follow the law',
      ] },
      { p: `We rely on your consent, given when you accept these documents and sign in, and on what is needed to provide the service you asked for. You can withdraw consent by deleting your account.` },
    ],
  },
  {
    title: { en: 'Who handles and sees your data', ml: 'ഡാറ്റ കൈകാര്യം ചെയ്യുന്നവർ' },
    blocks: [
      { p: `Services we use:` },
      { ul: [
        'Google Firebase (Authentication and Cloud Firestore) and Google Sign-In, to sign you in and store your data. Your records are stored in a Cloud Firestore database located in India. Sign in data is handled by Firebase Authentication, which is not tied to one country.',
        'Cloudflare, which hosts and delivers the app.',
      ] },
      { p: `These providers process data under their own terms and privacy policies. We do not sell personal data or share it for advertising.` },
      { p: `Inside Ledgro:` },
      { ul: [
        'Members of your shop can see its bills, expenses, products, stock transfers, cash counts and member names.',
        'Admins can also manage members and invite codes. The shop admin can read the shop\'s error reports.',
        'Other shops cannot see your shop. Database security rules enforce this.',
        'People who run Ledgro can technically reach the database. They use that access only to operate, secure and fix the service, or where the law requires.',
      ] },
      { p: `We may disclose data to a court, regulator or government body where the law requires.` },
    ],
  },
  {
    title: { en: 'Data on your device', ml: 'ഉപകരണത്തിലെ ഡാറ്റ' },
    blocks: [
      { p: `Ledgro stores some data in your browser:` },
      { ul: [
        'your sign in session',
        'a local copy of your product list and other recently loaded data, so screens open quickly (it can be out of date)',
        'your settings, such as default payment method and haptic feedback',
        'the shop you last used, and an unsaved bill that is recovered if the app reloads',
        'the app files, so the app opens fast',
      ] },
      { p: `Signing out removes your session and the local product list from the device. You can also clear everything in your browser settings.` },
    ],
  },
  {
    title: { en: 'How long we keep data', ml: 'എത്ര കാലം സൂക്ഷിക്കും' },
    blocks: [
      { ul: [
        'Shop records are kept as long as the shop exists. Bills cannot be deleted by members. A bill can be voided within 24 hours.',
        'If you are the only member and you delete your account, the shop and all its records are permanently deleted.',
        'When you delete your account, your sign in account, consent record and display name are deleted. If the shop has other members, the bills and other records you created stay with the shop.',
        'Invite codes expire after 30 minutes.',
        'Google may keep backups and logs for a limited time after deletion.',
        'We may keep limited information longer where the law requires or to handle a dispute.',
      ] },
    ],
  },
  {
    title: { en: 'Security', ml: 'സുരക്ഷ' },
    blocks: [
      { ul: [
        'Data is encrypted in transit, and encrypted at rest by Google.',
        'Database rules let only signed in members read or change their shop\'s data, and limit what each role can do.',
        'Sessions end after 3 days. Invite codes work once.',
      ] },
      { p: `No online service is perfectly secure. Use a screen lock, protect your Google account, and remove members who no longer need access. If a personal data breach affects you, we will tell you and the authorities as the law requires.` },
    ],
  },
  {
    title: { en: 'Your rights', ml: 'നിങ്ങളുടെ അവകാശങ്ങൾ' },
    blocks: [
      { p: `Under the DPDP Act you can:` },
      { ul: [
        'ask what personal data we hold about you and how it is used',
        'correct or complete your data',
        'ask for your data to be erased',
        'withdraw your consent at any time',
        'have a complaint heard (see Grievance below)',
        'nominate someone to exercise your rights if you die or cannot act',
      ] },
      { p: `You can correct shop details, products and expenses in the app, export reports from Settings or Bill History, and delete your account from Settings. For anything else, write to support@ledgro.in from your Google account email so we can confirm it is you.` },
    ],
  },
  {
    title: { en: 'Children', ml: 'കുട്ടികൾ' },
    blocks: [
      { p: `Ledgro is for people aged 18 or older. We do not knowingly collect data from children. If you believe a child has an account, write to support@ledgro.in and we will remove it.` },
    ],
  },
  {
    title: { en: 'Changes to this policy', ml: 'നയത്തിലെ മാറ്റങ്ങൾ' },
    blocks: [
      { p: `We update this policy when the app or the law changes. The date and version are shown on this page. For important changes we will ask you to accept again, and we record the version you accepted.` },
    ],
  },
  {
    title: { en: 'Grievance and contact', ml: 'പരാതി, ബന്ധപ്പെടാൻ' },
    blocks: [
      { p: `Grievance Officer: Ledgro Support, support@ledgro.in. Include your Google account email and a clear description of the issue. We will acknowledge your complaint and reply with the outcome.` },
      { p: `If you are not satisfied, you may complain to the Data Protection Board of India under the DPDP Act.` },
    ],
  },
];
