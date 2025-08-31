import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import {
  XMarkIcon,
  ClockIcon,
  ArrowLeftIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

interface Version {
  id: string;
  snapshotHtml: string;
  snapshotMarkdown: string;
  createdAt: Timestamp;
  createdBy: string;
  changeNote: string;
}

interface VersionHistoryModalProps {
  noteId: string;
  onRestore: (restoredData: { 
    id: string; 
    contentHtml: string; 
    contentMarkdown: string; 
    plainText: string; 
    wordCount: number; 
  }) => void;
  onClose: () => void;
}

const VersionHistoryModal: React.FC<VersionHistoryModalProps> = ({
  noteId,
  onRestore,
  onClose,
}) => {
  const { user } = useAuth();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<Version | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);

  // Fetch versions from Firestore
  useEffect(() => {
    if (!noteId) return;

    const versionsRef = collection(db, `notes/${noteId}/versions`);
    const q = query(versionsRef, orderBy('createdAt', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedVersions: Version[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<Version, 'id'>,
        createdAt: doc.data().createdAt instanceof Timestamp 
          ? doc.data().createdAt 
          : Timestamp.fromDate(new Date()),
      }));
      
      setVersions(fetchedVersions);
      setLoading(false);
      setError(null);
    }, (error) => {
      console.error("Error fetching version history: ", error);
      setError("Failed to load version history. You may not have permission to view this data.");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [noteId]);

  // Handle restore version
  const handleRestore = async (version: Version) => {
    if (!user || restoring) return;
    
    if (!window.confirm('Are you sure you want to restore this version? This will overwrite the current note content.')) {
      return;
    }

    setRestoring(version.id);
    try {
      // Convert HTML to plain text for the plainText field
      const plainText = stripHtml(version.snapshotHtml);
      
      // Update the main note document with the version content
      const noteRef = doc(db, 'notes', noteId);
      await updateDoc(noteRef, {
        contentHtml: version.snapshotHtml,
        contentMarkdown: version.snapshotMarkdown,
        plainText: plainText,
        updatedAt: serverTimestamp(),
        wordCount: plainText.split(/\s+/).filter(word => word.length > 0).length,
      });

      // Create a new version entry documenting the restore
      const versionsRef = collection(db, `notes/${noteId}/versions`);
      await addDoc(versionsRef, {
        snapshotHtml: version.snapshotHtml,
        snapshotMarkdown: version.snapshotMarkdown,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        changeNote: `Restored from ${formatDate(version.createdAt)}`,
      });

      console.log('✅ Version restored successfully');
      
      // Call the onRestore callback to update the parent component
      // Pass the updated note data instead of just version ID
      onRestore({
        id: noteId,
        contentHtml: version.snapshotHtml,
        contentMarkdown: version.snapshotMarkdown,
        plainText: plainText,
        wordCount: plainText.split(/\s+/).filter(word => word.length > 0).length,
      });
      
      // Close modal after successful restore
      onClose();
    } catch (error) {
      console.error('Error restoring version:', error);
      // Don't use blocking alert - just log the error
      console.error('Failed to restore version. Please try again.');
    } finally {
      setRestoring(null);
    }
  };

  // Utility function to strip HTML tags for plain text
  const stripHtml = (html: string): string => {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  };

  // Format date for display
  const formatDate = (timestamp: Timestamp): string => {
    const date = timestamp.toDate();
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Get user email from uid (simplified - in real app you'd want to store user info)
  const getUserEmail = (uid: string): string => {
    if (uid === user?.uid) return user?.email || 'You';
    return `User ${uid.substring(0, 8)}...`; // Fallback for other users
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-200 dark:border-neutral-700">
          <div className="flex items-center space-x-3">
            <ClockIcon className="h-6 w-6 text-primary-sky-blue" />
            <h2 className="font-poppins text-xl font-semibold text-neutral-900 dark:text-neutral-100">
              Version History
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-neutral-500 dark:text-neutral-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-5rem)]">
          {/* Version List */}
          <div className="w-1/2 border-r border-neutral-200 dark:border-neutral-700 overflow-y-auto">
            <div className="p-4">
              <h3 className="font-medium text-neutral-900 dark:text-neutral-100 mb-4">
                Previous Versions ({versions.length})
              </h3>
              
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-primary-sky-blue border-t-transparent rounded-full animate-spin"></div>
                  <span className="ml-3 text-neutral-600 dark:text-neutral-400">Loading versions...</span>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <ClockIcon className="h-12 w-12 text-red-400 mx-auto mb-3" />
                  <p className="text-red-500 dark:text-red-400 text-sm px-4">{error}</p>
                </div>
              ) : versions.length === 0 ? (
                <div className="text-center py-8">
                  <ClockIcon className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
                  <p className="text-neutral-500 dark:text-neutral-400">No version history available</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {versions.map((version) => (
                    <div
                      key={version.id}
                      className={`p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                        previewVersion?.id === version.id
                          ? 'border-primary-sky-blue bg-blue-50 dark:bg-blue-900 dark:bg-opacity-20'
                          : 'border-neutral-200 dark:border-neutral-600 hover:border-neutral-300 dark:hover:border-neutral-500'
                      }`}
                      onClick={() => setPreviewVersion(version)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <p className="font-medium text-neutral-900 dark:text-neutral-100 text-sm">
                            {formatDate(version.createdAt)}
                          </p>
                          <p className="text-xs text-neutral-500 dark:text-neutral-400">
                            by {getUserEmail(version.createdBy)}
                          </p>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewVersion(version);
                            }}
                            className="p-1 rounded text-neutral-400 hover:text-primary-sky-blue transition-colors"
                            title="Preview"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRestore(version);
                            }}
                            disabled={restoring === version.id}
                            className="p-1 rounded text-neutral-400 hover:text-secondary-green transition-colors disabled:opacity-50"
                            title="Restore"
                          >
                            {restoring === version.id ? (
                              <div className="w-4 h-4 border-2 border-secondary-green border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                              <ArrowLeftIcon className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                      <p className="text-sm text-neutral-600 dark:text-neutral-300 italic">
                        {version.changeNote}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 overflow-y-auto">
            <div className="p-4">
              {previewVersion ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
                      Preview: {formatDate(previewVersion.createdAt)}
                    </h3>
                    <button
                      onClick={() => handleRestore(previewVersion)}
                      disabled={restoring === previewVersion.id}
                      className="bg-secondary-green hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                    >
                      {restoring === previewVersion.id ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Restoring...</span>
                        </>
                      ) : (
                        <>
                          <ArrowLeftIcon className="h-4 w-4" />
                          <span>Restore This Version</span>
                        </>
                      )}
                    </button>
                  </div>
                  
                  <div className="bg-neutral-50 dark:bg-neutral-700 rounded-lg p-4 max-h-96 overflow-y-auto">
                    <div 
                      className="prose prose-neutral dark:prose-invert max-w-none text-sm"
                      dangerouslySetInnerHTML={{ __html: previewVersion.snapshotHtml }}
                    />
                  </div>
                  
                  <div className="mt-4 p-3 bg-neutral-100 dark:bg-neutral-600 rounded-lg">
                    <p className="text-sm text-neutral-600 dark:text-neutral-300">
                      <strong>Change Note:</strong> {previewVersion.changeNote}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                      <strong>Created by:</strong> {getUserEmail(previewVersion.createdBy)} • {formatDate(previewVersion.createdAt)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-center">
                  <div>
                    <EyeIcon className="h-12 w-12 text-neutral-400 mx-auto mb-3" />
                    <p className="text-neutral-500 dark:text-neutral-400">
                      Select a version to preview
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VersionHistoryModal;
