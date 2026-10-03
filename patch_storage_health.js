import fs from 'fs';

let content = fs.readFileSync('src/lib/storageHealth.js', 'utf-8');

// Fix storageHealth: try/catch, guard quota=0, handle persistence
content = `export async function checkStorageHealth() {
  if (!navigator.storage?.estimate) return null;

  try {
    const { usage, quota } = await navigator.storage.estimate();
    if (!quota) return null; // Avoid NaN/Infinity

    const usagePercent = (usage / quota) * 100;

    // Check if storage is persistent to prevent eviction
    let persisted = false;
    if (navigator.storage?.persisted) {
      persisted = await navigator.storage.persisted();
    }

    return {
      usage,
      quota,
      usagePercent,
      usageMB: Math.round(usage / 1024 / 1024),
      quotaMB: Math.round(quota / 1024 / 1024),
      isWarning: usagePercent > 70, // Note: Quotas are so large on modern Safari that 70% is rarely hit unless filling device
      isCritical: usagePercent > 90,
      persisted
    };
  } catch (err) {
    console.warn("Storage estimate failed", err);
    return null;
  }
}`;

fs.writeFileSync('src/lib/storageHealth.js', content);

// Only toast once per session
let dashContent = fs.readFileSync('src/pages/Dashboard.jsx', 'utf-8');
dashContent = dashContent.replace(
  /checkStorageHealth\(\)\.then\(health => \{[\s\S]*?\}\);/g,
  `checkStorageHealth().then(health => {
      if (!health) return;
      if (!sessionStorage.getItem('storageWarningShown')) {
        if (health.isCritical) {
          toast.error(\`Storage almost full (\${health.usagePercent.toFixed(0)}% used). Export your data soon.\`);
          sessionStorage.setItem('storageWarningShown', 'true');
        } else if (health.isWarning) {
          toast.warning(\`Storage at \${health.usagePercent.toFixed(0)}%. Consider exporting data.\`);
          sessionStorage.setItem('storageWarningShown', 'true');
        }
      }
    });`
);
fs.writeFileSync('src/pages/Dashboard.jsx', dashContent);

// Add persistent indicator in settings
let settingsContent = fs.readFileSync('src/pages/Settings.jsx', 'utf-8');
settingsContent = settingsContent.replace(
  /<span className="text-xs text-slate-500">\{storageHealth\.usageMB\} MB \/ \{storageHealth\.quotaMB\} MB<\/span>/,
  `<div className="text-right flex flex-col items-end">
    <span className="text-xs text-slate-500">{storageHealth.usageMB} MB / {storageHealth.quotaMB} MB</span>
    {storageHealth.persisted !== undefined && (
      <span className={\`text-[10px] font-bold px-1.5 py-0.5 rounded mt-1 \${storageHealth.persisted ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}\`}>
        {storageHealth.persisted ? 'Storage Persisted (Safe)' : 'Temporary Storage (Risk)'}
      </span>
    )}
  </div>`
);
fs.writeFileSync('src/pages/Settings.jsx', settingsContent);
