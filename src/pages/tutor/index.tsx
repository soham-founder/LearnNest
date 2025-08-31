import React from 'react';
import TutorChat from './modules/TutorChat';
import QuickHints from './modules/QuickHints';
import AdaptiveSuggestions from './modules/AdaptiveSuggestions';
import ProgressPanel from './modules/ProgressPanel';

const TutorPage: React.FC = () => {
  return (
    <div className="flex flex-col lg:flex-row h-full w-full bg-neutral-light dark:bg-neutral-dark">
      <div className="flex-1 p-4 lg:p-6 overflow-hidden">
        <TutorChat />
      </div>
      <aside className="w-full lg:w-[380px] xl:w-[420px] border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 lg:p-5 overflow-y-auto">
        <QuickHints />
        <AdaptiveSuggestions className="mt-6" />
        <ProgressPanel className="mt-6" />
      </aside>
    </div>
  );
};

export default TutorPage;
