import React, { useState } from 'react';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../common/firebase';
import { UserIcon, LockClosedIcon } from '@heroicons/react/24/outline'; // Import icons

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegister, setIsRegister] = useState(false);
  const navigate = useNavigate();

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let userCredential;
      if (isRegister) {
        userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          uid: userCredential.user.uid,
          name: userCredential.user.displayName || email.split('@')[0],
          email: userCredential.user.email,
          createdAt: new Date().toISOString(), // Consider using serverTimestamp() from Firestore
          lastLogin: new Date().toISOString(), // Consider using serverTimestamp() from Firestore
        });
      } else {
        userCredential = await signInWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, 'users', userCredential.user.uid), {
          lastLogin: new Date().toISOString(), // Consider using serverTimestamp() from Firestore
        }, { merge: true });
      }
      navigate('/dashboard');
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);

      // Store user profile in Firestore (users collection)
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        uid: userCredential.user.uid,
        name: userCredential.user.displayName || userCredential.user.email?.split('@')[0] || 'User',
        email: userCredential.user.email,
        createdAt: new Date().toISOString(), // Consider using serverTimestamp() for consistency
        lastLogin: new Date().toISOString(), // Consider using serverTimestamp() for consistency
      }, { merge: true }); // Use merge: true to avoid overwriting existing data if user signs in again

      navigate('/dashboard');
    } catch (error: any) {
      console.error("Error during Google Sign-In: ", error);
      alert(error.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-charcoal p-4">
      <div className="bg-charcoal-light p-8 rounded-2xl shadow-xl w-full max-w-sm border border-gray-600">
        <h2 className="font-poppins text-4xl font-bold text-center text-neutral-100 mb-8">
          {isRegister ? 'Sign Up' : 'Login'}
        </h2>
        <form onSubmit={handleEmailAuth} className="space-y-6">
          <div className="relative">
            <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="email"
              id="email"
              className="w-full pl-10 pr-3 py-2 border-b-2 border-gray-600 focus:border-primary-sky-blue bg-transparent text-neutral-100 placeholder-neutral-400 focus:outline-none text-lg transition duration-150 ease-in-out"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
            />
          </div>
          <div className="relative">
            <LockClosedIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-neutral-400" />
            <input
              type="password"
              id="password"
              className="w-full pl-10 pr-3 py-2 border-b-2 border-gray-600 focus:border-primary-sky-blue bg-transparent text-neutral-100 placeholder-neutral-400 focus:outline-none text-lg transition duration-150 ease-in-out"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              required
            />
            <a href="#" className="absolute right-0 bottom-2 text-sm text-primary-sky-blue hover:underline dark:text-primary-sky-blue transition duration-150 ease-in-out">Forgot password?</a>
          </div>
          <button
            type="submit"
            className="w-full py-3 rounded-full text-white font-semibold text-lg bg-gradient-to-r from-cyan-400 to-fuchsia-500 hover:from-cyan-500 hover:to-fuchsia-600 shadow-lg transform hover:-translate-y-1 transition duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            {isRegister ? 'SIGN UP' : 'LOGIN'}
          </button>
        </form>
        <div className="relative flex py-5 items-center">
          <div className="flex-grow border-t border-neutral-300 dark:border-neutral-700"></div>
          <span className="flex-shrink mx-4 text-neutral-500 dark:text-neutral-400 text-sm">Or {isRegister ? 'sign up' : 'login'} using</span>
          <div className="flex-grow border-t border-neutral-300 dark:border-neutral-700"></div>
        </div>
        <div className="flex justify-center space-x-4 mb-6">
          <button className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-600 text-white shadow-md hover:bg-blue-700 transition duration-150 ease-in-out transform hover:-translate-y-0.5">
            <svg fill="currentColor" viewBox="0 0 24 24" className="h-6 w-6"><path d="M9 8h-3v4h3v12h5v-12h3.642l.358-4h-4v-1.667c0-.955.248-1.333 1.144-1.333h2.856v-5h-3.129c-3.373 0-4.971 1.959-4.971 4.901v2.099z"/></svg>
          </button>
          <button className="w-12 h-12 rounded-full flex items-center justify-center bg-blue-400 text-white shadow-md hover:bg-blue-500 transition duration-150 ease-in-out transform hover:-translate-y-0.5">
            <svg fill="currentColor" viewBox="0 0 24 24" className="h-6 w-6"><path d="M24 4.557c-.883.392-1.832.656-2.828.775 1.017-.609 1.798-1.574 2.165-2.724-.951.564-2.005.974-3.127 1.195-.897-.957-2.178-1.555-3.594-1.555-3.395 0-6.157 2.766-6.157 6.167 0 .485.056.958.17 1.404-5.122-.252-9.662-2.723-12.703-6.471-.527.906-.834 1.954-.834 3.064 0 2.134 1.085 4.072 2.723 5.196-.998-.031-1.937-.306-2.752-.763v.086c0 2.998 2.13 5.495 4.965 6.07-.518.142-1.065.218-1.625.218-.399 0-.786-.039-1.163-.112.793 2.479 3.076 4.28 5.767 4.331-2.094 1.643-4.743 2.624-7.615 2.624-.493 0-.978-.029-1.456-.085 2.709 1.743 5.932 2.767 9.39 2.767 11.267 0 17.417-9.353 17.417-17.456 0-.264-.007-.528-.02-.792.956-.695 1.787-1.56 2.457-2.549z"/></svg>
          </button>
          <button onClick={handleGoogleSignIn} className="w-12 h-12 rounded-full flex items-center justify-center bg-red-600 text-white shadow-md hover:bg-red-700 transition duration-150 ease-in-out transform hover:-translate-y-0.5">
            <svg fill="currentColor" viewBox="0 0 24 24" className="h-6 w-6"><path d="M12.0003 4.75C14.0203 4.75 15.6573 5.438 16.9583 6.608L18.6533 4.903C16.7153 3.167 14.2213 2.25 12.0003 2.25C8.36934 2.25 5.24734 4.363 3.79234 7.311L5.61734 8.783C6.44434 7.025 8.02634 5.75 12.0003 4.75Z" fill="#EA4335"/><path d="M21.5 12.25C21.5 11.58 21.44 10.965 21.33 10.38H12V13.88H17.79C17.51 15.495 16.635 16.77 15.355 17.615L17.265 19.035C18.425 18.065 19.34 16.62 19.89 15.02C20.67 12.985 21.5 12.25 21.5 12.25Z" fill="#4285F4"/><path d="M12.0003 21.75C14.2213 21.75 16.7153 20.833 18.6533 19.097L16.9583 17.392C15.6573 18.562 14.0203 19.25 12.0003 19.25C8.02634 19.25 6.44434 17.975 5.61734 16.217L3.79234 17.689C5.24734 20.637 8.36934 22.75 12.0003 22.75Z" fill="#34A853"/><path d="M2.5 12.25C2.5 11.58 2.56 10.965 2.67 10.38H12V13.88H6.21C6.49 15.495 7.365 16.77 8.645 17.615L6.735 19.035C5.575 18.065 4.66 16.62 4.11 15.02C3.33 12.985 2.5 12.25 2.5 12.25Z" fill="#FBBC04"/></svg>
          </button>
        </div>
        <div className="text-center">
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-lg text-primary-sky-blue hover:text-blue-800 dark:hover:text-primary-sky-blue font-semibold transition duration-150 ease-in-out"
          >
            {isRegister ? 'Already have an account? Login' : 'Need an account? Sign Up'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
