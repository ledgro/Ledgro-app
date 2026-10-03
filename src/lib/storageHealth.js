export async function checkStorageHealth() {
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
}