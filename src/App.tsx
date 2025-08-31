import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Login = lazy(() => import('./pages/Login'));
const Notes = lazy(() => import('./pages/Notes'));
const Flashcards = lazy(() => import('./pages/Flashcards'));
const Planner = lazy(() => import('./pages/Planner'));
const TutorPage = lazy(() => import('./pages/tutor'));
const Mood = lazy(() => import('./pages/Mood'));
const Settings = lazy(() => import('./pages/Settings'));
const Quizzes = lazy(() => import('./pages/Quizzes'));
const AIMockInterviews = lazy(() => import('./pages/AIMockInterviews'));
const KnowledgeTree = lazy(() => import('./pages/KnowledgeTree'));
const SharedDeck = lazy(() => import('./pages/SharedDeck'));
import DashboardLayout from './layouts/DashboardLayout';
import { AuthProvider, useAuth } from './context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    // Apply theme to loading state
    return (
      <div className="flex items-center justify-center min-h-screen bg-charcoal text-neutral-200">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-primary-sky-blue border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-lg">Loading application...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

function App() {
  return (
    <div className="min-h-screen" style={{ backgroundColor: '#262728', color: '#f1f5f9' }}>
      <AuthProvider>
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading…</div>}>
          <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public shared deck route */}
          <Route path="/shared/deck/:shareId" element={<SharedDeck />} />
          {/* Protected Routes using DashboardLayout */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <DashboardLayout>
                  <Dashboard />
                </DashboardLayout>
              </ProtectedRoute>
            }
          />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Dashboard />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/notes"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Notes />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/flashcards/*"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Flashcards />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/planner"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Planner />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/ai"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <TutorPage />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/mood"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Mood />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Settings />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/quizzes"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <Quizzes />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/aimockinterviews"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <AIMockInterviews />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/knowledgetree"
          element={
            <ProtectedRoute>
              <DashboardLayout>
                <KnowledgeTree />
              </DashboardLayout>
            </ProtectedRoute>
          }
        />
          </Routes>
        </Suspense>
    </AuthProvider>
    </div>
  );
}

export default App;
