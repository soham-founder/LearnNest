import React from 'react';

const AdaptiveSuggestions: React.FC<{ className?: string }> = ({ className }) => {
  const items = [
    { title: 'Warm-up check', text: 'Explain the main idea in one sentence.' },
    { title: 'Targeted practice', text: 'Try a similar example with one changed value.' },
    { title: 'Reflect', text: 'What pattern or rule did you use here?' },
  ];

  return (
    <section aria-labelledby="adaptive-title" className={className}>
      <h3 id="adaptive-title" className="font-poppins text-lg font-semibold text-neutral-900 dark:text-neutral-100">Adaptive Suggestions</h3>
      <div className="mt-2 space-y-2">
        {items.map((it, idx) => (
          <div key={idx} className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-700 p-3">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">{it.title}</p>
            <p className="text-sm text-neutral-700 dark:text-neutral-300">{it.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default AdaptiveSuggestions;
