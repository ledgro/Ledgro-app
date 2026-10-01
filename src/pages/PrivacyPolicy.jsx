import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function PrivacyPolicy() {
  const [lang, setLang] = useState('en');

  const content = {
    title: { en: 'Privacy Policy', ml: 'സ്വകാര്യതാ നയം' },
    sections: [
      {
        title: { en: 'Itemized Data Description', ml: 'ഞങ്ങൾ ശേഖരിക്കുന്ന വിവരങ്ങൾ' },
        text: {
           en: 'Account Data: Name, Google Auth email, and Shop Name collected strictly for identification and tenancy separation.\nFinancial Data: Daily bill totals, expense values, and cash/UPI splits stored encrypted on Google Cloud Firebase within India (asia-south1 - Mumbai region).\nCustomer Contact Data: Customer phone numbers entered for digital receipts are processed strictly in client-side memory and never harvested, profiled, or transferred to third-party ad networks.',
           ml: 'നിങ്ങളുടെ ഗൂഗിൾ അക്കൗണ്ട് വിവരങ്ങൾ (പേര്, ഇമെയിൽ), ഷോപ്പിന്റെ പേര്, ബില്ലുകൾ, ചെലവുകൾ എന്നിവ ഞങ്ങൾ ശേഖരിക്കുന്നു. ഉപഭോക്താക്കളുടെ ഫോൺ നമ്പറുകൾ ഉപകരണത്തിൽ മാത്രം പ്രോസസ്സ് ചെയ്യപ്പെടുന്നു, ഒരിക്കലും പരസ്യ ആവശ്യങ്ങൾക്കായി ഉപയോഗിക്കില്ല. എല്ലാ വിവരങ്ങളും ഇന്ത്യയിലെ (മുംബൈ) Google Firebase സെർവറുകളിലാണ് സൂക്ഷിക്കുന്നത്.'
        }
      },
      {
        title: { en: 'Right to Erasure', ml: 'ഇല്ലാതാക്കാനുള്ള അവകാശം' },
        text: {
           en: 'You can delete all shop and user records completely via the in-app settings interface.',
           ml: 'ആപ്പ് ക്രമീകരണങ്ങൾ വഴി നിങ്ങളുടെ എല്ലാ വിവരങ്ങളും ഷോപ്പും പൂർണ്ണമായും ഇല്ലാതാക്കാം.'
        }
      },
      {
        title: { en: 'Statutory Grievance Redressal Mechanism', ml: 'പരാതി പരിഹാരം' },
        text: {
           en: 'Designated Grievance Officer: [Designated Founder/Support Lead]\nContact: support@ledgro.in\nStatutory Escalation Notice: If a user grievance is not resolved satisfactorily, the Data Principal holds the statutory right under the DPDPA to register a complaint with the Data Protection Board of India (DPBI).',
           ml: 'പരാതി പരിഹാര ഓഫീസർ: [സ്ഥാപകൻ/പിന്തുണാ ലീഡ്]\nബന്ധപ്പെടുക: support@ledgro.in\nപരാതി തൃപ്തികരമായി പരിഹരിക്കപ്പെട്ടില്ലെങ്കിൽ, ഇന്ത്യയിലെ ഡാറ്റാ പ്രൊട്ടക്ഷൻ ബോർഡിൽ (DPBI) പരാതി നൽകാൻ DPDPA പ്രകാരം നിങ്ങൾക്ക് നിയമപരമായ അവകാശമുണ്ട്.'
        }
      }
    ]
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
       <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center shadow-subtle">
         <div className="flex items-center gap-2">
            <Link to="/login" className="p-1 -ml-1 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
               <ChevronLeft size={24} />
            </Link>
            <h1 className="text-xl font-bold text-slate-900">{content.title[lang]}</h1>
         </div>
         <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => setLang('en')} className={cn("px-2.5 py-1 text-xs font-bold rounded", lang === 'en' ? "bg-white shadow-sm text-blue-600" : "text-slate-500")}>EN</button>
            <button onClick={() => setLang('ml')} className={cn("px-2.5 py-1 text-xs font-bold rounded", lang === 'ml' ? "bg-white shadow-sm text-blue-600" : "text-slate-500")}>ML</button>
         </div>
       </header>
       <main className="p-4 flex-1">
         <div className="max-w-md mx-auto space-y-6 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
           {content.sections.map((sec, i) => (
             <div key={i}>
                <h2 className="text-sm font-bold text-slate-900 mb-1">{sec.title[lang]}</h2>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{sec.text[lang]}</p>
             </div>
           ))}
           <p className="text-xs text-slate-400 font-medium mt-8 pt-4 border-t border-slate-100">Last updated: Sept 2026</p>
         </div>
       </main>
    </div>
  );
}