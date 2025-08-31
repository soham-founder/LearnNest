import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  BookOpenIcon,
  ClipboardDocumentListIcon, // Changed from ClipboardListIcon
  RectangleStackIcon, // Changed from CollectionIcon
  LightBulbIcon,
  CogIcon,
  SunIcon,
  MoonIcon,
  AcademicCapIcon, // For Quizzes
  ChatBubbleLeftRightIcon, // For AI Tutor
  MicrophoneIcon, // For AI Mock Interviews
  CubeTransparentIcon, // For Knowledge Tree
} from '@heroicons/react/24/outline';

interface SidebarLinkProps {
  to: string;
  icon: React.ElementType;
  label: string;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ to, icon: Icon, label }) => {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      className={`flex items-center space-x-3 p-3 rounded-xl transition-all duration-200 ease-in-out transform hover:-translate-y-0.5 group
        ${isActive
          ? 'bg-primary-sky-blue bg-opacity-10 dark:bg-primary-sky-blue dark:bg-opacity-20 text-primary-sky-blue font-semibold shadow-md'
          : 'text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:shadow-soft'
        }
      `}
    >
      <Icon
        className={`h-6 w-6 transition-colors duration-200
          ${isActive ? 'text-primary-sky-blue' : 'text-neutral-500 group-hover:text-primary-sky-blue dark:group-hover:text-primary-sky-blue'}
        `}
      />
      <span className="hidden md:inline-block font-inter text-base font-medium transition-colors duration-200">
        {label}
      </span>
    </Link>
  );
};

const Sidebar: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = React.useState(() => {
    // Initialize dark mode from localStorage or system preference
    if (typeof window !== 'undefined' && localStorage.theme === 'dark') {
      return true;
    } else if (typeof window !== 'undefined' && !('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return true;
    }
    return false;
  });

  React.useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(prevMode => !prevMode);
  };

  return (
    <div className="w-64 bg-charcoal-dark h-full shadow-lg flex flex-col">
      {/* Logo Section */}
      <div className="p-6 border-b border-gray-600">
        <Link 
          to="/dashboard" 
          className="block transition-all duration-200 hover:opacity-80 hover:scale-105"
        >
          <h1 className="text-2xl font-bold text-neutral-100 cursor-pointer">LearnNest</h1>
        </Link>
      </div>
      {/* Navigation Links */}
      <nav className="flex-grow space-y-3">
        <SidebarLink to="/dashboard" icon={HomeIcon} label="Dashboard" />
        <SidebarLink to="/planner" icon={ClipboardDocumentListIcon} label="Planner" />
        <SidebarLink to="/notes" icon={BookOpenIcon} label="Notes" />
        <SidebarLink to="/flashcards" icon={RectangleStackIcon} label="Flashcards" />
        <SidebarLink to="/quizzes" icon={AcademicCapIcon} label="Quizzes" />
        <SidebarLink to="/ai" icon={ChatBubbleLeftRightIcon} label="AI Tutor" />
        <SidebarLink to="/aimockinterviews" icon={MicrophoneIcon} label="AI Mock Interviews" />
        <SidebarLink to="/knowledgetree" icon={CubeTransparentIcon} label="Knowledge Tree" />
        <SidebarLink to="/mood" icon={LightBulbIcon} label="Wellness" />
        <SidebarLink to="/settings" icon={CogIcon} label="Settings" />
      </nav>
      {/* Dark Mode Toggle */}
      <div className="mt-auto p-2">
        <button
          onClick={toggleDarkMode}
          className="w-full flex items-center space-x-3 p-3 rounded-xl text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors duration-200 shadow-soft focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:ring-offset-2 dark:focus:ring-offset-neutral-dark transform hover:-translate-y-0.5"
        >
          {isDarkMode ? (
            <SunIcon className="h-6 w-6 text-accent-warm-orange" />
          ) : (
            <MoonIcon className="h-6 w-6 text-neutral-medium" />
          )}
          <span className="hidden md:inline-block font-inter text-base font-medium">
            {isDarkMode ? 'Light Mode' : 'Dark Mode'}
          </span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
