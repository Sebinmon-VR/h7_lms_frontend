/**
 * Title case for names stored in capitals: "ART & CRAFT" reads as "Art & Craft",
 * "NEETHU K" as "Neethu K". Names already in mixed case are left alone. Display
 * only — the stored value is never changed.
 */
export function tidyName(name: string) {
  // Short names are codes, not words: IT, SST, GK, "VE / MS" stay as they are.
  if (name.replace(/[^A-Za-z]/g, '').length <= 4) return name
  return name === name.toUpperCase() && /[A-Z]{2}/.test(name)
    ? name.toLowerCase().replace(/(^|[\s(/&-])([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase())
    : name
}
