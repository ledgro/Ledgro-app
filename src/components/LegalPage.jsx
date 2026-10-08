import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';

// TODO: native speaker review of the Malayalam strings.
const ML_NOTICE = 'ഈ പേജിലെ വിശദമായ വ്യവസ്ഥകൾ ഇംഗ്ലീഷിലാണ്. തലക്കെട്ടുകളും പ്രധാന കാര്യങ്ങളുടെ സംഗ്രഹവും മലയാളത്തിൽ നൽകിയിരിക്കുന്നു. സംശയമുണ്ടെങ്കിൽ ഇംഗ്ലീഷ് പതിപ്പാണ് ബാധകം.';

function Block({ b }) {
  if (b.h) return <h3 className="text-base font-bold text-slate-900 mt-6 mb-1">{b.h}</h3>;
  if (b.ul) {
    return (
      <ul className="list-disc pl-6 space-y-2 my-3 text-[15px] leading-7 text-slate-700 marker:text-slate-400">
        {b.ul.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    );
  }
  if (b.note) {
    return <div className="my-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[15px] leading-7 text-amber-900">{b.note}</div>;
  }
  return <p className="my-3 text-[15px] leading-7 text-slate-700">{b.p}</p>;
}

export default function LegalPage({ title, updated, version, intro, keyPoints, sections, other }) {
  const [lang, setLang] = useState('en');
  const jump = (i) => document.getElementById(`sec-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-white border-b border-slate-100 px-4 py-3 flex justify-between items-center shadow-subtle">
        <div className="flex items-center gap-2 min-w-0">
          <Link to="/login" aria-label="Back" className="p-1 -ml-1 text-slate-500 hover:text-slate-900 rounded-full hover:bg-slate-100 transition-colors">
            <ChevronLeft size={24} />
          </Link>
          <h1 className="text-lg font-bold text-slate-900 truncate">{title[lang]}</h1>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-lg shrink-0">
          {['en', 'ml'].map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={cn('px-3 py-1.5 text-xs font-bold rounded uppercase', lang === l ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500')}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-4 py-6">
        <article className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">{title[lang]}</h2>
            <p className="text-sm text-slate-500 mt-2">Last updated {updated} (version {version})</p>

            {lang === 'ml' && (
              <div className="mt-5 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-[15px] leading-7 text-blue-900">{ML_NOTICE}</div>
            )}

            {lang === 'en' && <p className="mt-5 text-base leading-7 text-slate-700">{intro}</p>}

            <section className="mt-6 rounded-xl bg-slate-50 border border-slate-200 p-5">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-3">{lang === 'en' ? 'The short version' : 'ചുരുക്കത്തിൽ'}</h3>
              <ul className="list-disc pl-5 space-y-2 text-[15px] leading-7 text-slate-800 marker:text-blue-500">
                {keyPoints[lang].map((k, i) => <li key={i}>{k}</li>)}
              </ul>
            </section>

            <nav aria-label="Contents" className="mt-6">
              <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500 mb-2">{lang === 'en' ? 'Contents' : 'ഉള്ളടക്കം'}</h3>
              <ol className="space-y-1">
                {sections.map((s, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => jump(i)} className="text-left text-[15px] leading-6 text-blue-600 hover:underline py-1">
                      {i + 1}. {s.title[lang]}
                    </button>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="mt-8 space-y-10">
              {sections.map((s, i) => (
                <section key={i} id={`sec-${i}`} className="scroll-mt-20">
                  <h2 className="text-xl font-bold text-slate-900 pb-2 border-b border-slate-100">{i + 1}. {s.title[lang]}</h2>
                  {s.blocks.map((b, j) => <Block key={j} b={b} />)}
                </section>
              ))}
            </div>

            <footer className="mt-12 pt-6 border-t border-slate-100 text-sm text-slate-500 space-y-2">
              <p>Questions? Write to <a className="text-blue-600 underline" href="mailto:support@ledgro.in">support@ledgro.in</a>.</p>
              <p><Link to={other.to} className="text-blue-600 underline">{other.label}</Link></p>
              <p>Last updated {updated} (version {version})</p>
            </footer>
          </div>
        </article>
      </main>
    </div>
  );
}
