import fs from 'fs';
let content = fs.readFileSync('src/pages/SignIn.jsx', 'utf-8');

// Fix 1: If getDoc throws, sign out and show error.
const readThrowOld = /const userSnap = await getDoc\(userRef\);\n\s*if \(userSnap\.data\(\)\?\.consentRecord\?\.policyVersion !== POLICY_VERSION\) \{/g;
const readThrowNew = `let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (readError) {
          console.error("Consent read failed:", readError);
          await auth.signOut();
          setError(lang === 'en' ? "Failed to verify consent. Please try again." : "സമ്മതം പരിശോധിക്കാൻ കഴിഞ്ഞില്ല. വീണ്ടും ശ്രമിക്കുക.");
          return;
        }

        if (userSnap.data()?.consentRecord?.policyVersion !== POLICY_VERSION) {`;

content = content.replace(readThrowOld, readThrowNew);

// Fix 2: Render {error && ...} in the in-app-browser branch as well
const iabErrorOld = /\{copied \n\s*\? \(lang === 'en' \? 'Link Copied!' : 'ലിങ്ക് പകർത്തി!'\) \n\s*: \(lang === 'en' \? 'Copy Link' : 'ലിങ്ക് പകർത്തുക'\)\}\n\s*<\/button>\n\s*<\/div>/g;
const iabErrorNew = `{copied
                ? (lang === 'en' ? 'Link Copied!' : 'ലിങ്ക് പകർത്തി!')
                : (lang === 'en' ? 'Copy Link' : 'ലിങ്ക് പകർത്തുക')}
            </button>
            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
          </div>`;

content = content.replace(iabErrorOld, iabErrorNew);

// Fix 3: Handle raw Firebase errors silently if cancelled, generic otherwise
const errObjOld = /catch \(err\) \{\n\s*console\.error\(err\);\n\s*setError\(err\.message \|\| \(lang === 'en' \? 'Failed to sign in\. Please try again\.' : 'സൈൻ ഇൻ പരാജയപ്പെട്ടു\. വീണ്ടും ശ്രമിക്കുക\.'\)\); \/\/ TODO: native speaker review/g;
const errObjNew = `catch (err) {
      console.error(err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        // Silently ignore user cancellations
      } else {
        setError(lang === 'en' ? 'Failed to sign in. Please try again.' : 'സൈൻ ഇൻ പരാജയപ്പെട്ടു. വീണ്ടും ശ്രമിക്കുക.');
      }`;

content = content.replace(errObjOld, errObjNew);

fs.writeFileSync('src/pages/SignIn.jsx', content);
