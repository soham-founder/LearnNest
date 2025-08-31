import React from 'react';

const QuickHints: React.FC = () => {
  const hints = [
    'Try restating the problem in your own words.',
    'What information is given? What is asked?',
    'Identify one small step you can verify.',
  ];

  return (
    <section aria-labelledby="hints-title">
      <h3 id="hints-title" className="font-poppins text-lg font-semibold text-neutral-900 dark:text-neutral-100">Quick Hints</h3>
      <ul className="mt-2 space-y-2">
        {hints.map((h, i) => (
          <li key={i} className="text-sm bg-neutral-100 dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 rounded-lg px-3 py-2">
            {h}
          </li>
        ))}
      </ul>
    </section>
  );
};

export default QuickHints;
