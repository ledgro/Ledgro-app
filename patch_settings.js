import fs from 'fs';

let content = fs.readFileSync('src/pages/Settings.jsx', 'utf-8');

// Fix 1: CSV injection vulnerability
const escapeCSV = `const escapeCSV = (val) => {
  if (val === null || val === undefined) return '';
  let str = String(val);
  if (/^[=+\\-@]/.test(str)) {
    str = "'" + str;
  }
  str = str.replace(/"/g, '""');
  return \`"\${str}"\`;
};`;

content = content.replace(/const escapeCSV.*?\n/s, escapeCSV + '\n');
if(!content.includes("const escapeCSV")) {
    // If not found, add it inside handleExportData
    content = content.replace(
        "const handleExportData = async () => {",
        "const handleExportData = async () => {\n    " + escapeCSV.replace(/\n/g, "\n    ")
    );
}

// Fix 2: Saving profile wipes data
// Ensure updateDoc uses the right payload and doesn't wipe members map
content = content.replace(
  /await updateDoc\(docRef,\s*\{\s*name:\s*shopName\.trim\(\),\s*address:\s*address\.trim\(\),\s*phone:\s*phone\.trim\(\),\s*tagline:\s*tagline\.trim\(\)\s*\}\);/,
  `await updateDoc(docRef, {
        name: shopName.trim(),
        address: address.trim(),
        phone: phone.trim(),
        tagline: tagline.trim(),
        updatedAt: Date.now()
      });`
);

// Fix 3: Clear Cache destroying unsynced offline sales
content = content.replace(
  /const handleClearCache = async \(\) => {[\s\S]*?window\.location\.reload\(true\);\n    }\n  };/,
  `const handleClearCache = async () => {
    try {
      const pending = await getAllData('pendingBills');
      if (pending && pending.length > 0) {
        toast.error("Cannot clear cache with pending bills. Please connect to the internet to sync first.");
        return;
      }
    } catch (e) {
      console.warn("Could not check pending bills", e);
    }

    if (window.confirm("This will clear local app cache and reload the app. Unsaved offline data may be lost. Continue?")) {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (let registration of registrations) {
          await registration.unregister();
        }
      }
      window.location.reload(true);
    }
  };`
);

fs.writeFileSync('src/pages/Settings.jsx', content);
