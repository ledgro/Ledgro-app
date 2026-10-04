import fs from 'fs';
let content = fs.readFileSync('src/components/Receipt.jsx', 'utf-8');

// Some callers of <Receipt /> might render it in a context outside <AuthProvider> (like Portal root for capture)
// So we cannot call useAuth directly without a try/catch or a context check. But React rules forbid try/catch around hooks.
// Best approach: drop useAuth here entirely, and rely purely on billData for shopName, tagline, phone, address.
// We'll update the callers later if needed, but for now we fallback gracefully to what billData provides.

content = content.replace(/import \{ useAuth \} from '\.\.\/context\/AuthContext'; \/\/ To pull shop profile/g, "");
content = content.replace(/let shopProfile = null;\n\s*const authContext = useAuth\(\);\n\s*if \(authContext\) shopProfile = authContext\.shop;/g, "const shopProfile = billData?.shopProfile || {};");

fs.writeFileSync('src/components/Receipt.jsx', content);
