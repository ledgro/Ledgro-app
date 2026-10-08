// Plain data for the Privacy Policy page. Keep punctuation simple: no long dashes.
// TODO: native speaker review of the Malayalam strings.
export const PRIVACY_VERSION = '2026-10';
export const PRIVACY_UPDATED = '8 October 2026';

export const privacyTitle = { en: 'Privacy Policy', ml: 'സ്വകാര്യതാ നയം' };

export const privacyIntro = `This policy explains what personal data Ledgro collects, why, where it is kept, who can see it, and what control you have over it. We have tried to keep it short and clear, and to describe only what the app really does.`;

export const privacyKeyPoints = {
  en: [
    'We collect only what Ledgro needs to work: your Google sign in details, your shop details, and the records you enter.',
    'We do not sell your data, show ads, or use advertising or analytics trackers.',
    'We do not collect your customers\' names or phone numbers.',
    'Your data is stored with Google Firebase, in a database located in India.',
    'Only members of your shop can see your shop\'s records.',
    'You can export your records and delete your account and shop from Settings.',
  ],
  ml: [
    'Ledgro പ്രവർത്തിക്കാൻ ആവശ്യമായ വിവരങ്ങൾ മാത്രമേ ശേഖരിക്കൂ: ഗൂഗിൾ സൈൻ ഇൻ വിവരങ്ങൾ, കടയുടെ വിവരങ്ങൾ, നിങ്ങൾ രേഖപ്പെടുത്തുന്ന കണക്കുകൾ.',
    'ഞങ്ങൾ നിങ്ങളുടെ ഡാറ്റ വിൽക്കുന്നില്ല, പരസ്യങ്ങൾ കാണിക്കുന്നില്ല, പരസ്യ-അനലിറ്റിക്സ് ട്രാക്കറുകൾ ഉപയോഗിക്കുന്നില്ല.',
    'നിങ്ങളുടെ ഉപഭോക്താക്കളുടെ പേരോ ഫോൺ നമ്പറോ ഞങ്ങൾ ശേഖരിക്കുന്നില്ല.',
    'നിങ്ങളുടെ ഡാറ്റ ഇന്ത്യയിലുള്ള ഗൂഗിൾ ഫയർബേസ് ഡാറ്റാബേസിലാണ് സൂക്ഷിക്കുന്നത്.',
    'നിങ്ങളുടെ കടയിലെ അംഗങ്ങൾക്ക് മാത്രമേ കടയിലെ രേഖകൾ കാണാൻ കഴിയൂ.',
    'സെറ്റിംഗ്സിൽ നിന്ന് രേഖകൾ എക്സ്പോർട്ട് ചെയ്യാം, അക്കൗണ്ടും കടയും ഇല്ലാതാക്കാം.',
  ],
};

export const privacySections = [
  {
    title: { en: 'Who we are', ml: 'ഞങ്ങൾ ആരാണ്' },
    blocks: [
      { p: `Ledgro is a billing, ledger and expense app for small shops. For the personal data described here, Ledgro decides why and how the data is used, which makes Ledgro the "data fiduciary" under the Digital Personal Data Protection Act, 2023 ("DPDP Act"). You are the "data principal".` },
      { p: `You can reach us at support@ledgro.in.` },
    ],
  },
  {
    title: { en: 'What we collect', ml: 'ഞങ്ങൾ എന്ത് ശേഖരിക്കുന്നു' },
    blocks: [
      { h: 'When you sign in' },
      { p: `Ledgro uses Google Sign-In. We receive your Google account name, email address and profile picture link, and a unique user ID from Firebase Authentication. We never see your Google password.` },
      { h: 'Your consent record' },
      { p: `When you accept our Terms and this policy, we save that you accepted, the version you accepted, the language you used, and the time.` },
      { h: 'Your shop' },
      { p: `Shop name, and if you choose to add them, the shop address, phone number and tagline. We also keep the list of shop members and whether each one is an admin or a member, and the invite codes you create, with their expiry and who used them.` },
      { h: 'Your business records' },
      { ul: [
        'Bills and returns: the items, quantities, prices, discounts, totals, how it was paid (cash, UPI or split), bill number, time, and which member made it.',
        'Expenses: amount, category, note, how it was paid, time, and which member recorded it.',
        'Products: name, price, unit, stock count and related details.',
        'Cash counts: expected cash, counted cash and the difference, for a day.',
      ] },
      { h: 'Technical data' },
      { p: `Like any online service, the Google services we use receive technical information when your phone connects, such as your IP address, device and browser type, and request logs. Google uses this to run and secure its services.` },
    ],
  },
  {
    title: { en: 'What we do not collect', ml: 'ഞങ്ങൾ ശേഖരിക്കാത്തവ' },
    blocks: [
      { ul: [
        'Your customers\' names, phone numbers or addresses. Ledgro has no place to enter them.',
        'Your contacts, photos, files, camera, microphone or location.',
        'Card numbers, bank account numbers or UPI PINs. Ledgro only records that a bill was paid by cash, UPI or both. It does not process payments.',
        'Advertising identifiers. Ledgro shows no ads, and it has no analytics or advertising trackers.',
      ] },
    ],
  },
  {
    title: { en: 'Why we use your data', ml: 'എന്തിനാണ് ഡാറ്റ ഉപയോഗിക്കുന്നത്' },
    blocks: [
      { p: `We use your data only to run Ledgro for you:` },
      { ul: [
        'to sign you in and keep you signed in for up to 3 days',
        'to save your bills, expenses, products and cash counts, and show them back to you and your team',
        'to work out your totals and reports',
        'to keep your shop separate from every other shop, and to keep it secure',
        'to keep proof that you accepted our Terms and this policy',
        'to answer your support requests and complaints',
        'to follow the law',
      ] },
      { p: `Our basis for using your data is your consent, which you give when you accept these documents and sign in, and the use of data that is necessary to give you the service you asked for. You can withdraw your consent at any time by deleting your account.` },
    ],
  },
  {
    title: { en: 'Where your data is stored and who handles it', ml: 'ഡാറ്റ എവിടെ സൂക്ഷിക്കുന്നു' },
    blocks: [
      { p: `Your account and shop data is stored with Google Firebase (Authentication and Cloud Firestore). Our Firestore database is located in India.` },
      { p: `We use these other services:` },
      { ul: [
        'Google Sign-In, to let you sign in with your Google account.',
        'Google Fonts, which loads the font for the Ledgro name. Your device contacts Google to get it, so Google can see your IP address.',
        'A web hosting provider, which delivers the app files to your device.',
      ] },
      { p: `These companies process data for us, or for their own services, under their own terms and privacy policies. We do not sell your personal data to anyone, and we do not share it for advertising.` },
    ],
  },
  {
    title: { en: 'Who can see your data', ml: 'ആർക്കൊക്കെ ഡാറ്റ കാണാം' },
    blocks: [
      { ul: [
        'Members of your shop can see the shop\'s bills, expenses, products and cash counts.',
        'Admins can also see and manage the member list and invite codes.',
        'Members of other shops cannot see your shop. Access is controlled by security rules in the database.',
        'A small number of people who run Ledgro can technically reach the database. They use that access only to run, secure and fix the service, or where the law requires it.',
        'We may share data with a court, regulator or government body if the law requires us to.',
      ] },
    ],
  },
  {
    title: { en: 'How long we keep your data', ml: 'എത്ര കാലം സൂക്ഷിക്കും' },
    blocks: [
      { ul: [
        'Your shop records are kept for as long as your shop exists, because your ledger is meant to be a lasting record. Saved bills cannot be edited or deleted by members. They can only be voided.',
        'When you delete your shop, or you are the only member and delete your account, all the shop\'s records are permanently deleted from the live database.',
        'When you delete your account, your sign in account and your consent record are deleted too.',
        'Backups and logs held by Google may keep copies for a limited time after deletion before they are removed.',
        'We may keep limited information longer if the law requires it, or if we need it to handle a dispute.',
      ] },
    ],
  },
  {
    title: { en: 'How we protect your data', ml: 'ഡാറ്റ എങ്ങനെ സംരക്ഷിക്കുന്നു' },
    blocks: [
      { ul: [
        'Data is encrypted in transit between your device and Google, and encrypted at rest by Google.',
        'Security rules in the database let only signed in members of a shop read or change that shop\'s data, and limit what each role can do.',
        'Sessions end automatically after 3 days.',
        'Invite codes are single use and expire after 30 minutes.',
      ] },
      { p: `No online service can be made perfectly safe. Please protect your own phone with a screen lock, keep your Google account secure, and remove team members who no longer work with you. If a personal data breach happens that affects you, we will tell you and the authorities as the law requires.` },
    ],
  },
  {
    title: { en: 'Data stored on your device', ml: 'നിങ്ങളുടെ ഉപകരണത്തിലെ ഡാറ്റ' },
    blocks: [
      { p: `To work smoothly, Ledgro keeps some information in your browser on your phone:` },
      { ul: [
        'your sign in session',
        'a local copy of recently loaded data, so that screens open quickly (this copy can be out of date)',
        'your settings, such as theme, default payment method and haptic feedback, and your recent searches',
        'the shop you last used, and an unsaved sale that is recovered if the app has to reload',
        'the app files themselves, so that the app opens fast',
      ] },
      { p: `Signing out removes this information from the device. You can also clear it from your browser settings. The privacy hide setting on the dashboard only blurs amounts on the screen. It does not change what is stored.` },
    ],
  },
  {
    title: { en: 'Your rights', ml: 'നിങ്ങളുടെ അവകാശങ്ങൾ' },
    blocks: [
      { p: `Under the DPDP Act, you have these rights over your personal data:` },
      { ul: [
        'To know what personal data we hold about you and how it is used.',
        'To correct data that is wrong or out of date, and to complete data that is missing.',
        'To ask for your data to be erased.',
        'To withdraw your consent at any time.',
        'To get your complaint dealt with through our grievance process.',
        'To nominate another person to exercise your rights if you die or cannot act for yourself.',
      ] },
      { h: 'How to use them' },
      { ul: [
        'Correct your shop details in Settings, and your products and expenses on their screens.',
        'Export your bills and expenses as PDF or PNG reports from Settings or Bill History.',
        'Delete your account and, if you are the only member, your shop from Settings.',
        'For anything else, write to support@ledgro.in from the email address of your Google account, so that we can confirm it is you.',
      ] },
      { p: `Records in a shop belong to the shop. If you leave a shop that has other members, or delete your account, you are removed from the member list, but the bills, expenses and other records of that shop stay with the shop.` },
    ],
  },
  {
    title: { en: 'Children', ml: 'കുട്ടികൾ' },
    blocks: [
      { p: `Ledgro is for people who are 18 or older. We do not knowingly collect personal data from children. If you believe a child has used Ledgro, write to support@ledgro.in and we will remove the account.` },
    ],
  },
  {
    title: { en: 'Changes to this policy', ml: 'നയത്തിലെ മാറ്റങ്ങൾ' },
    blocks: [
      { p: `We may update this policy when the app or the law changes. The date and version are shown on this page. If a change is important, we will tell you in the app and ask you to accept again. We record the version you accepted.` },
    ],
  },
  {
    title: { en: 'Grievance redressal', ml: 'പരാതി പരിഹാരം' },
    blocks: [
      { p: `If you have a concern or complaint about your personal data, please write to our Grievance Officer.` },
      { ul: [
        'Grievance Officer: Ledgro Support',
        'Email: support@ledgro.in',
      ] },
      { p: `Please include your Google account email and a clear description of the issue. We will acknowledge your complaint and reply to you with the outcome.` },
      { p: `If you are not satisfied with our response, you have the right under the DPDP Act to complain to the Data Protection Board of India.` },
    ],
  },
  {
    title: { en: 'Contact', ml: 'ബന്ധപ്പെടാൻ' },
    blocks: [
      { p: `For any question about this policy, write to support@ledgro.in.` },
    ],
  },
];
