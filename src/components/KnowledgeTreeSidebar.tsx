import React from 'react';

interface KnowledgeTreeSidebarProps {
  subjects: string[];
  onSelectSubject: (subject: string) => void;
  selectedSubject: string | null;
}

const KnowledgeTreeSidebar: React.FC<KnowledgeTreeSidebarProps> = ({
  subjects,
  onSelectSubject,
  selectedSubject,
}) => {
  return (
    <div className="w-full md:w-64 bg-neutral-100 dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col flex-shrink-0 mb-6 md:mb-0 md:mr-6 rounded-2xl shadow-soft">
      <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100 p-4 border-b border-neutral-200 dark:border-neutral-700">Subjects</h2>
      <nav className="flex-grow p-2 space-y-1 overflow-y-auto">
        {subjects.map(subject => (
          <button
            key={subject}
            onClick={() => onSelectSubject(subject)}
            className={`w-full text-left px-4 py-2 rounded-xl font-sans font-medium transition-all duration-150 ease-in-out transform hover:-translate-y-0.5 group
              ${selectedSubject === subject
                ? 'bg-primary-sky-blue bg-opacity-10 dark:bg-primary-sky-blue dark:bg-opacity-20 text-primary-sky-blue font-semibold shadow-sm'
                : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:shadow-soft'
              }
            `}
          >
            {subject}
          </button>
        ))}
      </nav>
    </div>
  );
};

export default KnowledgeTreeSidebar;
