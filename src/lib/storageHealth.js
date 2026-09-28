export async function checkStorageHealth() {
  if (!navigator.storage?.estimate) return null;

  const { usage, quota } = await navigator.storage.estimate();
  const usagePercent = (usage / quota) * 100;

  return {
    usage,
    quota,
    usagePercent,
    usageMB: Math.round(usage / 1024 / 1024),
    quotaMB: Math.round(quota / 1024 / 1024),
    isWarning: usagePercent > 70,
    isCritical: usagePercent > 90
  };
}
