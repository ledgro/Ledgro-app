import fs from 'fs';

let content = fs.readFileSync('src/lib/utils.js', 'utf-8');

// Remove DOMPurify import and function usage since we are changing sanitizeText
content = content.replace("import DOMPurify from 'dompurify';\n", "");

// Replace toPaise
content = content.replace(
  /export const toPaise = \(rupees\) => Math\.round\(parseFloat\(rupees \|\| 0\) \* 100\);/,
  `export const toPaise = (rupees) => {
  if (rupees === null || rupees === undefined || rupees === '') return null;
  const val = Number(rupees);
  if (!Number.isFinite(val)) return null;
  return Math.round(val * 100);
};`
);

// Replace toRupees
content = content.replace(
  /export const toRupees = \(paise\) => \(paise \|\| 0\) \/ 100;/,
  `export const toRupees = (paise) => {
  if (paise === null || paise === undefined || paise === '') return 0;
  const val = Number(paise);
  if (!Number.isFinite(val)) return 0;
  return val / 100;
};`
);

// Replace formatCurrency
const oldFormatCurrencyRegex = /export const formatCurrency = \(value\) => \{[\s\S]*?\};\n/g;
content = content.replace(oldFormatCurrencyRegex,
`export const formatCurrency = (value) => {
  if (value === null || value === undefined || value === '') return '₹0';

  let val = Number(value);
  if (!Number.isFinite(val)) return '₹0';

  // Always treat the input as paise.
  const inRupees = toRupees(val);
  const absoluteRupees = Math.abs(inRupees);

  const formatted = absoluteRupees.toLocaleString('en-IN', {
    minimumFractionDigits: absoluteRupees % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  return (inRupees < 0 ? '-' : '') + '₹' + formatted;
};
`);

// Replace sanitizeText
const oldSanitizeTextRegex = /export function sanitizeText\(input\) \{[\s\S]*?\}/g;
content = content.replace(oldSanitizeTextRegex,
`export function sanitizeText(input) {
  if (!input) return '';
  // React already escapes text for rendering, so we just trim and optionally limit length
  return String(input).trim().slice(0, 500); // 500 is an arbitrary generous limit to prevent crazy long string abuse
}`);

fs.writeFileSync('src/lib/utils.js', content);
