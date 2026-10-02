import fs from 'fs';

let content = fs.readFileSync('src/pages/Expenses.jsx', 'utf-8');

// Fix 1: add paidVia in payload, validate amount, resolve offline hang by not awaiting addDoc offline
content = content.replace(
  /const handleAddExpense = async \(e\) => {[\s\S]*?setSubmitting\(false\);\n    }\n  };/,
  `const handleAddExpense = async (e) => {
    e.preventDefault();
    const parsedAmount = Math.round(parseFloat(amount) * 100);
    if (!shopId || !parsedAmount || parsedAmount <= 0) {
      toast.error("Enter a valid amount.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        amount: parsedAmount,
        description: description.trim().slice(0, 200),
        category: category,
        paidVia: paidVia,
        creatorId: user.uid,
        createdAt: serverTimestamp(),
        clientCreatedAt: new Date().toISOString()
      };

      const expensesRef = collection(db, \`shops/\${shopId}/expenses\`);
      // Don't await addDoc for offline responsiveness. Firestore SDK will queue it.
      let newDocRef;
      if (navigator.onLine) {
        newDocRef = await addDoc(expensesRef, payload);
      } else {
        // Fire and forget if offline so UI doesn't hang
        addDoc(expensesRef, payload).catch(err => console.warn('Offline add deferred', err));
        newDocRef = { id: crypto.randomUUID() }; // Fake ID for optimistic UI
      }

      // Optimistic addition
      setExpenses(prev => [{ id: newDocRef.id, ...payload, createdAt: { toDate: () => new Date() } }, ...prev]);

      // Reset form
      setAmount('');
      setDescription('');
      setCategory(CATEGORIES[0].id);
      setIsOpen(false);
      hapticVibrate(10);
    } catch (err) {
      console.error(err);
      toast.error("Failed to add expense");
    } finally {
      setSubmitting(false);
    }
  };`
);

// Fix 2: Delete confirmation
content = content.replace(
  /const handleDeleteExpense = async \(expenseId\) => {/,
  `const handleDeleteExpense = async (expenseId) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;`
);

fs.writeFileSync('src/pages/Expenses.jsx', content);
