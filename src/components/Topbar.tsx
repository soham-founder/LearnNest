import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getAuth, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../common/firebase';
import { UserCircleIcon, ChevronDownIcon, ArrowRightOnRectangleIcon } from '@heroicons/react/24/outline';

const Topbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const auth = getAuth();
  const [userName, setUserName] = useState('Guest');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Ref for the dropdown menu to handle clicks outside
  const dropdownRef = useRef<HTMLDivElement>(null);

  /**
   * @function useEffect
   * @description Fetches user profile information from Firebase Auth and Firestore.
   * Updates user's name and avatar in the Topbar.
   */
  useEffect(() => {
    const fetchUserProfile = async () => {
      if (user) {
        setUserName(user.displayName || user.email?.split('@')[0] || 'User');
        setUserAvatar(user.photoURL || null);
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            setUserName(userData.name || user.displayName || user.email?.split('@')[0] || 'User');
            setUserAvatar(userData.avatar || user.photoURL || null);
          }
        } catch (error) {
          console.error("Error fetching user profile: ", error);
          // Fallback to default user info if Firestore fetch fails
        }
      } else {
        setUserName('Guest');
        setUserAvatar(null);
      }
    };

    fetchUserProfile();
  }, [user]);

  /**
   * @function useEffect
   * @description Closes the dropdown when a click occurs outside of it.
   */
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  /**
   * @function getPageTitle
   * @description Determines the current page title based on the URL pathname.
   * @param {string} pathname - The current URL pathname.
   * @returns {string} The title of the current page.
   */
  const getPageTitle = (pathname: string) => {
    switch (pathname) {
      case '/dashboard':
        return 'Dashboard';
      case '/planner':
        return 'Planner';
      case '/notes':
        return 'Notes';
      case '/flashcards':
        return 'Flashcards';
      case '/quizzes': // New route
        return 'Quizzes';
      case '/ai':
        return 'AI Tutor'; // Renamed
      case '/aimockinterviews': // New route
        return 'AI Mock Interviews';
      case '/knowledgetree': // New route
        return 'Knowledge Tree';
      case '/mood':
        return 'Wellness';
      case '/settings':
        return 'Settings';
      default:
        return 'LearnNest';
    }
  };

  /**
   * @function handleLogout
   * @description Handles user logout, signs out from Firebase, and redirects to login page.
   */
  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error: any) {
      console.error("Error logging out: ", error);
      alert('Error logging out: ' + error.message);
    }
  };

  return (
    <div className="sticky top-0 z-10 flex-shrink-0 flex h-16 bg-charcoal-light shadow-soft rounded-bl-2xl px-6 font-sans">
      <div className="flex-1 flex justify-between items-center">
        {/* Page Title */}
        <div className="flex items-center">
          <h1 className="font-poppins text-xl font-semibold text-neutral-100">
            {getPageTitle(location.pathname)}
          </h1>
        </div>
        {/* User Profile and Dropdown */}
        <div className="ml-4 flex items-center">
          {user && (
            <div className="relative" ref={dropdownRef}> {/* Attach ref to the dropdown container */}
              <button
                type="button"
                className="max-w-xs bg-transparent rounded-full flex items-center text-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:ring-offset-2 dark:focus:ring-offset-neutral-dark p-1 transition duration-150 ease-in-out transform hover:-translate-y-0.5"
                id="user-menu-button"
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                onClick={() => setDropdownOpen(!dropdownOpen)}
              >
                <span className="sr-only">Open user menu</span>
                {userAvatar ? (
                  <img className="h-9 w-9 rounded-full object-cover" src={userAvatar} alt="User Avatar" />
                ) : (
                  <UserCircleIcon className="h-9 w-9 text-neutral-400 dark:text-neutral-300" />
                )}
                <span className="ml-2 text-neutral-200 hidden md:block font-medium">
                  {userName}
                </span>
                <ChevronDownIcon className="ml-1 h-5 w-5 text-neutral-300 hidden md:block transition-transform duration-150 ease-in-out" />
              </button>
              {dropdownOpen && (
                <div
                  className="origin-top-right absolute right-0 mt-2 w-48 rounded-xl shadow-lg py-1 bg-white dark:bg-neutral-700 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
                  role="menu"
                  aria-orientation="vertical"
                  aria-labelledby="user-menu-button"
                >
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-600 flex items-center space-x-2 transition-colors duration-150 ease-in-out rounded-lg mx-1 my-1"
                    role="menuitem"
                  >
                    <ArrowRightOnRectangleIcon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Topbar;
