import React from 'react';

const ProgressPanel: React.FC<{ className?: string }> = ({ className }) => {
  // TODO: bind to analytics/memory store from backend
  const progress = [
    { topic: 'Algebra', mastery: 0.76 },
    { topic: 'Functions', mastery: 0.62 },
    { topic: 'Graphs', mastery: 0.44 },
  ];

  return (
    <section aria-labelledby="progress-title" className={className}>
      <h3 id="progress-title" className="font-poppins text-lg font-semibold text-neutral-900 dark:text-neutral-100">Your Progress</h3>
      <div className="mt-3 space-y-3">
        {progress.map((p, i) => (
          <div key={i}>
            <div className="flex justify-between text-sm text-neutral-700 dark:text-neutral-300 mb-1">
              <span>{p.topic}</span>
              <span>{Math.round(p.mastery * 100)}%</span>
            </div>
            <div className="w-full h-2 bg-neutral-200 dark:bg-neutral-700 rounded-full">
              <div className="h-2 bg-secondary-green rounded-full" style={{ width: `${Math.round(p.mastery * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ProgressPanel;
