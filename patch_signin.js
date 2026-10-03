import fs from 'fs';

let content = fs.readFileSync('src/pages/SignIn.jsx', 'utf-8');

// Fix 2: Import POLICY_VERSION
if (!content.includes("POLICY_VERSION")) {
  console.log("Adding POLICY_VERSION import");
}

content = content.replace(
  /import \{ Link, useNavigate \} from 'react-router-dom';/,
  `import { Link, useNavigate } from 'react-router-dom';\nimport { POLICY_VERSION } from '../lib/constants';`
);

// Fix 4 & 6: Remove useState copies for isIAB and targetBrowser, fix Line regex
content = content.replace(
  /ua\.indexOf\('Line'\) > -1 \|\|/,
  `/\\bLine\\//.test(ua) ||`
);

content = content.replace(
  /const \[isInAppBrowser\] = useState\(isIAB\);\n\s*const \[browserTarget\] = useState\(targetBrowser\);/,
  ``
);
content = content.replace(/isInAppBrowser \?/g, "isIAB ?");
content = content.replace(/browserTarget/g, "targetBrowser");

// Fix 1 & 3: Consent write failure handling, re-consent logic
content = content.replace(
  /const userSnap = await getDoc\(userRef\);\n\s*if \(\!userSnap\.data\(\)\?\.consentRecord\) \{[\s\S]*?\}\n\s*\}/,
  `const userSnap = await getDoc(userRef);
        if (userSnap.data()?.consentRecord?.policyVersion !== POLICY_VERSION) {
          try {
            await setDoc(userRef, {
              consentRecord: {
                termsAccepted: true,
                policyVersion: POLICY_VERSION,
                language: lang,
                acceptedAt: serverTimestamp()
              }
            }, { merge: true });
          } catch (consentError) {
            console.error("Consent write failed:", consentError);
            await signOut(); // From useAuth, to be added to destructuring
            setError(lang === 'en' ? "Failed to save consent. Please try again." : "സമ്മതം രേഖപ്പെടുത്താൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.");
            return; // Halt redirect
          }
        }
      }`
);

// Fix 5: Translate remaining strings
content = content.replace(
  /setError\('Please accept the Terms of Service and Privacy Policy to continue\.'\);/,
  `setError(lang === 'en' ? 'Please accept the Terms of Service and Privacy Policy to continue.' : 'തുടരാൻ ദയവായി സേവന നിബന്ധനകളും സ്വകാര്യതാ നയവും അംഗീകരിക്കുക.'); // TODO: native speaker review`
);
content = content.replace(
  /setError\(err\.message \|\| 'Failed to sign in\. Please try again\.'\);/,
  `setError(err.message || (lang === 'en' ? 'Failed to sign in. Please try again.' : 'സൈൻ ഇൻ പരാജയപ്പെട്ടു. വീണ്ടും ശ്രമിക്കുക.')); // TODO: native speaker review`
);
content = content.replace(
  /\{isSigningIn \? 'Signing in\.\.\.' : 'Continue with Google'\}/,
  `{isSigningIn ? (lang === 'en' ? 'Signing in...' : 'സൈൻ ഇൻ ചെയ്യുന്നു...') : (lang === 'en' ? 'Continue with Google' : 'Google വഴി തുടരുക')} {/* TODO: native speaker review */}`
);

// Fix 7: Copy link fallback
content = content.replace(
  /try \{\n\s*document\.execCommand\('copy'\);\n\s*setCopied\(true\);\n\s*setTimeout\(\(\) => setCopied\(false\), 2000\);\n\s*\} catch \(err\) \{\n\s*console\.error\('Fallback copy error:', err\);\n\s*\}/,
  `try {
      const success = document.execCommand('copy');
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        setError(lang === 'en' ? "Copy failed. Long-press the address bar to copy the link." : "പകർത്തുവാൻ കഴിഞ്ഞില്ല. ലിങ്ക് പകർത്താൻ അഡ്രസ്സ് ബാറിൽ അമർത്തി പിടിക്കുക.");
      }
    } catch (err) {
      console.error('Fallback copy error:', err);
      setError(lang === 'en' ? "Copy failed. Long-press the address bar to copy the link." : "പകർത്തുവാൻ കഴിഞ്ഞില്ല. ലിങ്ക് പകർത്താൻ അഡ്രസ്സ് ബാറിൽ അമർത്തി പിടിക്കുക.");
    }`
);

// Fix 8: Add comment above data location text
content = content.replace(
  /<p className="text-\[11px\] text-slate-400 font-medium text-center mb-4">/,
  `{/* Only true if the Firestore database is in an Indian region (asia-south1/asia-south2). Verify in the Firebase console. */}
            <p className="text-[11px] text-slate-400 font-medium text-center mb-4">`
);

fs.writeFileSync('src/pages/SignIn.jsx', content);

// Ensure constants file exists
if (!fs.existsSync('src/lib/constants.js')) {
  fs.writeFileSync('src/lib/constants.js', "export const POLICY_VERSION = '1.0';\n");
}
