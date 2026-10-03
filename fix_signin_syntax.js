import fs from 'fs';
let content = fs.readFileSync('src/pages/SignIn.jsx', 'utf-8');
content = content.replace("      }, { merge: true });\n        }\n      }\n    } catch (err) {", "      }\n    } catch (err) {");
content = content.replace(/await signOut\(\); \/\/ From useAuth, to be added to destructuring/, "await auth.signOut(); // using auth directly since useAuth hook destructuring might be missing");
fs.writeFileSync('src/pages/SignIn.jsx', content);
