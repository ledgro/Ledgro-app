import fs from 'fs';

let content = fs.readFileSync('src/pages/Expenses.jsx', 'utf-8');

content = content.replace(
  /const handleDeleteExpense = async \(id\) => {/,
  `const handleDeleteExpense = async (id) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;`
);

fs.writeFileSync('src/pages/Expenses.jsx', content);
