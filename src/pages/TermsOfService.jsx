import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function TermsOfService() {
  const [lang, setLang] = useState('en');

  const content = {
    title: { en: 'Terms of Service', ml: 'സേവന വ്യവസ്ഥകൾ' },
    sections: [
      {
        title: { en: 'Tool-Only / Non-Accounting Disclaimer', ml: 'സേവന വ്യാപ്തി' },
        text: {
           en: 'Ledgro is an offline-first record-keeping tool provided on an "as-is" basis. It does not provide chartered accountancy, formal financial audits, or tax advisory services. The developers carry zero liability for cash drawer shortages, math errors due to inaccurate user inputs, or hardware failures.',
           ml: 'Ledgro ഒരു ബില്ലിംഗ് ടൂളാണ്, രജിസ്റ്റർ ചെയ്ത അക്കൗണ്ടിംഗ് സ്ഥാപനമല്ല. ഉപയോക്താവിന്റെ പിഴവുകൾ കാരണം ഉണ്ടാകുന്ന സാമ്പത്തിക വ്യത്യാസങ്ങൾ ഉപയോക്താവിന്റെ മാത്രം ഉത്തരവാദിത്തമാണ്.'
        }
      },
      {
        title: { en: 'GST Turnover Threshold Disclaimer', ml: 'GST നിരാകരണം' },
        text: {
           en: 'Ledgro v1 does not calculate GST or issue statutory tax invoices. It is designed solely for micro-retail businesses operating below mandatory registration thresholds (₹40 Lakhs annual turnover for goods in Kerala under GST regulations). Generating non-GST bills post-threshold and resulting tax liabilities remain the exclusive responsibility of the shop owner.',
           ml: 'GST-യിൽ രജിസ്റ്റർ ചെയ്യേണ്ടാത്ത സ്ഥാപനങ്ങൾക്കാണ് Ledgro നിർമ്മിച്ചിരിക്കുന്നത്. നിങ്ങളുടെ വാർഷിക വിറ്റുവരവ് ₹40 ലക്ഷം (സാധനങ്ങൾ) അല്ലെങ്കിൽ ₹20 ലക്ഷം (സേവനങ്ങൾ) കവിയുന്നുവെങ്കിൽ, GST അനുസരിച്ചുള്ള ഇൻവോയ്സുകൾ നൽകാൻ നിങ്ങൾ നിയമപരമായി ബാധ്യസ്ഥനാണ്. Ledgro അത്തരം ഇൻവോയ്സുകൾ സൃഷ്ടിക്കുന്നില്ല.'
        }
      },
      {
        title: { en: 'Labor Law Compliance Safeguard', ml: 'തൊഴിൽ നിയമം' },
        text: {
           en: 'Staff performance tracking provides simple aggregate counts (e.g., total bills generated) and is not an employee time-tracking or surveillance tool under the Kerala Shops and Commercial Establishments Act, 1960.',
           ml: 'ജീവനക്കാരുടെ പ്രകടനം ട്രാക്കുചെയ്യുന്നത് ലളിതമായ കണക്കുകൾ മാത്രമാണ് (ഉദാഹരണത്തിന്, മൊത്തം ബില്ലുകൾ). ഇത് 1960-ലെ കേരള ഷോപ്പ്സ് ആൻഡ് കൊമേഴ്സ്യൽ എസ്റ്റാബ്ലിഷ്മെന്റ്സ് ആക്റ്റ് അനുസരിച്ചുള്ള സമയ-നിരീക്ഷണ ഉപകരണമല്ല.'
        }
      },
      {
        title: { en: 'Data Portability Guarantee', ml: 'ഡാറ്റ ഉടമസ്ഥാവകാശം' },
        text: {
           en: 'Users maintain complete ownership of their commercial ledger and can export their full dataset at any time without fees or artificial lock-in.',
           ml: 'നിങ്ങളുടെ വിവരങ്ങൾ നിങ്ങളുടേതാണ്, ആപ്പ് ക്രമീകരണങ്ങളിൽ നിന്ന് എപ്പോൾ വേണമെങ്കിലും എക്‌സ്‌പോർട്ട് ചെയ്യാം.'
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
                <p className="text-sm text-slate-600 leading-relaxed">{sec.text[lang]}</p>
             </div>
           ))}
           <p className="text-xs text-slate-400 font-medium mt-8 pt-4 border-t border-slate-100">Last updated: Sept 2026</p>
         </div>
       </main>
    </div>
  );
}