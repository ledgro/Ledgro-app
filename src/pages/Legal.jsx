import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

export default function Legal() {
  const location = useLocation();
  const isPrivacy = location.pathname === '/privacy';
  const [lang, setLang] = useState('en');

  const content = {
    privacy: {
      title: { en: 'Privacy Policy', ml: 'സ്വകാര്യതാ നയം' },
      sections: [
        {
          title: { en: 'What Data We Collect', ml: 'ഞങ്ങൾ ശേഖരിക്കുന്ന വിവരങ്ങൾ' },
          text: {
             en: 'We collect your Google account information (name, email, UID), your shop name, bills, expenses, and product details.',
             ml: 'നിങ്ങളുടെ ഗൂഗിൾ അക്കൗണ്ട് വിവരങ്ങൾ (പേര്, ഇമെയിൽ, UID), ഷോപ്പിന്റെ പേര്, ബില്ലുകൾ, ചെലവുകൾ, ഉൽപ്പന്ന വിവരങ്ങൾ എന്നിവ ഞങ്ങൾ ശേഖരിക്കുന്നു.'
          }
        },
        {
          title: { en: 'Why We Collect It', ml: 'എന്തിനാണ് ഞങ്ങൾ ഇത് ശേഖരിക്കുന്നത്' },
          text: {
             en: 'To provide you with our billing and financial management service.',
             ml: 'ഞങ്ങളുടെ ബില്ലിംഗ്, സാമ്പത്തിക മാനേജ്മെന്റ് സേവനം നിങ്ങൾക്ക് നൽകുന്നതിന്.'
          }
        },
        {
          title: { en: 'Where It Is Stored', ml: 'ഇത് എവിടെയാണ് സൂക്ഷിക്കുന്നത്' },
          text: {
             en: 'Your data is securely stored on Google Firebase servers located in asia-south1 (Mumbai, India).',
             ml: 'നിങ്ങളുടെ വിവരങ്ങൾ സുരക്ഷിതമായി സൂക്ഷിക്കുന്നത് asia-south1 (മുംബൈ, ഇന്ത്യ)-യിലുള്ള Google Firebase സെർവറുകളിലാണ്.'
          }
        },
        {
          title: { en: 'How Long We Keep It', ml: 'ഇത് എത്രകാലം ഞങ്ങൾ സൂക്ഷിക്കും' },
          text: {
             en: 'We retain your data until you explicitly choose to delete your account and shop.',
             ml: 'നിങ്ങൾ അക്കൗണ്ടും ഷോപ്പും ഇല്ലാതാക്കാൻ തീരുമാനിക്കുന്നത് വരെ ഞങ്ങൾ നിങ്ങളുടെ വിവരങ്ങൾ നിലനിർത്തും.'
          }
        },
        {
          title: { en: 'Your Rights (DPDPA 2023)', ml: 'നിങ്ങളുടെ അവകാശങ്ങൾ (DPDPA 2023)' },
          text: {
             en: 'You have the right to access, correct, erase your data, and withdraw your consent at any time.',
             ml: 'ഏത് സമയത്തും നിങ്ങളുടെ ഡാറ്റ ആക്‌സസ് ചെയ്യാനും തിരുത്താനും ഇല്ലാതാക്കാനും സമ്മതം പിൻവലിക്കാനുമുള്ള അവകാശം നിങ്ങൾക്കുണ്ട്.'
          }
        },
        {
          title: { en: 'Data Sharing', ml: 'ഡാറ്റ പങ്കിടൽ' },
          text: {
             en: 'No data is ever sold to third parties. We use Google Firebase as our sole data processor.',
             ml: 'മൂന്നാം കക്ഷികൾക്ക് ഡാറ്റ വിൽക്കില്ല. ഞങ്ങൾ Google Firebase-നെ മാത്രമാണ് ഡാറ്റ പ്രോസസ്സറായി ഉപയോഗിക്കുന്നത്.'
          }
        },
        {
          title: { en: 'Contact', ml: 'ബന്ധപ്പെടുക' },
          text: {
             en: 'For any data protection inquiries, contact getledgro@gmail.com.',
             ml: 'ഡാറ്റ സംരക്ഷണ സംശയങ്ങൾക്ക് getledgro@gmail.com-ൽ ബന്ധപ്പെടുക.'
          }
        }
      ]
    },
    terms: {
      title: { en: 'Terms of Service', ml: 'സേവന വ്യവസ്ഥകൾ' },
      sections: [
        {
          title: { en: 'Service Scope', ml: 'സേവന വ്യാപ്തി' },
          text: {
             en: 'Ledgro is a billing tool, not a registered accounting firm. Any financial discrepancies arising from user input errors are solely the user\'s responsibility.',
             ml: 'Ledgro ഒരു ബില്ലിംഗ് ടൂളാണ്, രജിസ്റ്റർ ചെയ്ത അക്കൗണ്ടിംഗ് സ്ഥാപനമല്ല. ഉപയോക്താവിന്റെ പിഴവുകൾ കാരണം ഉണ്ടാകുന്ന സാമ്പത്തിക വ്യത്യാസങ്ങൾ ഉപയോക്താവിന്റെ മാത്രം ഉത്തരവാദിത്തമാണ്.'
          }
        },
        {
          title: { en: 'GST Disclaimer', ml: 'GST നിരാകരണം' },
          text: {
             en: 'Ledgro is designed for businesses not required to register for GST. If your annual turnover exceeds ₹40 lakhs (goods) or ₹20 lakhs (services), you are legally required to issue GST-compliant invoices. Ledgro does not generate GST-compliant invoices.',
             ml: 'GST-യിൽ രജിസ്റ്റർ ചെയ്യേണ്ടാത്ത സ്ഥാപനങ്ങൾക്കാണ് Ledgro നിർമ്മിച്ചിരിക്കുന്നത്. നിങ്ങളുടെ വാർഷിക വിറ്റുവരവ് ₹40 ലക്ഷം (സാധനങ്ങൾ) അല്ലെങ്കിൽ ₹20 ലക്ഷം (സേവനങ്ങൾ) കവിയുന്നുവെങ്കിൽ, GST അനുസരിച്ചുള്ള ഇൻവോയ്സുകൾ നൽകാൻ നിങ്ങൾ നിയമപരമായി ബാധ്യസ്ഥനാണ്. Ledgro അത്തരം ഇൻവോയ്സുകൾ സൃഷ്ടിക്കുന്നില്ല.'
          }
        },
        {
          title: { en: 'Data Ownership', ml: 'ഡാറ്റ ഉടമസ്ഥാവകാശം' },
          text: {
             en: 'Your data belongs to you and can be exported at any time from the app settings.',
             ml: 'നിങ്ങളുടെ വിവരങ്ങൾ നിങ്ങളുടേതാണ്, ആപ്പ് ക്രമീകരണങ്ങളിൽ നിന്ന് എപ്പോൾ വേണമെങ്കിലും എക്‌സ്‌പോർട്ട് ചെയ്യാം.'
          }
        },
        {
          title: { en: 'Account Termination', ml: 'അക്കൗണ്ട് അവസാനിപ്പിക്കൽ' },
          text: {
             en: 'Following account deletion, your data will remain available for export for exactly 30 days before permanent erasure.',
             ml: 'അക്കൗണ്ട് ഇല്ലാതാക്കിയ ശേഷം, പൂർണ്ണമായും മായ്ക്കുന്നതിന് മുമ്പായി കൃത്യം 30 ദിവസം വരെ നിങ്ങളുടെ ഡാറ്റ എക്‌സ്‌പോർട്ട് ചെയ്യാൻ ലഭ്യമായിരിക്കും.'
          }
        },
        {
          title: { en: 'Liability Restriction', ml: 'ബാധ്യത പരിമിതി' },
          text: {
             en: 'Ledgro is not liable for data loss occurring due to user device failure, browser storage eviction, or accidental local deletion.',
             ml: 'ഉപയോക്താവിന്റെ ഉപകരണത്തിലെ തകരാറുകൾ, ബ്രൗസർ ഡാറ്റ ഇല്ലാതാകൽ അല്ലെങ്കിൽ അബദ്ധത്തിൽ മാഞ്ഞുപോകൽ എന്നിവ മൂലമുണ്ടാകുന്ന ഡാറ്റാ നഷ്ടത്തിന് Ledgro ഉത്തരവാദിയല്ല.'
          }
        },
        {
          title: { en: 'Governing Law', ml: 'നിയമപരിധി' },
          text: {
             en: 'These terms are governed by the laws of Kerala, India.',
             ml: 'ഈ വ്യവസ്ഥകൾ ഇന്ത്യയിലെ കേരളത്തിന്റെ നിയമങ്ങൾക്ക് വിധേയമാണ്.'
          }
        }
      ]
    }
  };

  const page = isPrivacy ? content.privacy : content.terms;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
       <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center shadow-subtle">
         <div className="flex items-center gap-2">
            <Link to="/login" className="p-1 -ml-1 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
               <ChevronLeft size={24} />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">{page.title[lang]}</h1>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setLang('en')} className={cn("px-2.5 py-1 text-xs font-bold rounded", lang === 'en' ? "bg-white shadow-sm text-blue-600" : "text-slate-500")}>EN</button>
            <button onClick={() => setLang('ml')} className={cn("px-2.5 py-1 text-xs font-bold rounded", lang === 'ml' ? "bg-white shadow-sm text-blue-600" : "text-slate-500")}>ML</button>
         </div>
       </header>
       <main className="p-4 flex-1">
         <div className="max-w-md mx-auto space-y-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
           {page.sections.map((sec, i) => (
             <div key={i}>
                <h2 className="text-sm font-bold text-slate-900 mb-1">{sec.title[lang]}</h2>
                <p className="text-sm text-slate-600 leading-relaxed">{sec.text[lang]}</p>
             </div>
           ))}
           <p className="text-xs text-slate-400 font-medium mt-8 pt-4 border-t border-slate-100">Last updated: Sept 2026</p>
         </div>
       </main>
    </div>
  );
}
