import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  where,
  Timestamp,
  doc,
  serverTimestamp,
} from 'firebase/firestore';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  DocumentTextIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { NoteEditorPanel } from '../components/NoteEditorPanel';

// Simplified Note type for the list view
interface Note {
  id: string;
  title: string;
  plainText: string;
  updatedAt: Timestamp;
  isArchived: boolean;
}

/**
 * The Notes page component. It is responsible for:
 * 1. Displaying the list of notes for the current user.
 * 2. Handling note creation and deletion.
 * 3. Managing the selection of a note to be edited.
 * 4. Rendering the NoteEditorPanel for the selected note.
 */
const Notes: React.FC = () => {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Toast notification utility
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Firestore listener for the notes collection
  useEffect(() => {
    if (!user) {
      setNotes([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const notesRef = collection(db, 'notes');
    const q = query(
      notesRef,
      where('createdBy', '==', user.uid),
      where('isArchived', '==', false),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedNotes: Note[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data() as Omit<Note, 'id'>
      }));
      setNotes(fetchedNotes);
      setLoading(false);

      // Logic to handle selection after data changes
      if (fetchedNotes.length > 0) {
        if (!selectedNoteId || !fetchedNotes.some(n => n.id === selectedNoteId)) {
          // If no note is selected, or the selected one is gone, select the first.
          setSelectedNoteId(fetchedNotes[0].id);
        }
      } else {
        // No notes left, so deselect.
        setSelectedNoteId(null);
      }
    }, (error) => {
      console.error('❌ Error loading notes:', error);
      showToast(`Failed to load notes: ${error.message}`, 'error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, selectedNoteId]); // Dependency on `user` and `selectedNoteId` ensures it re-runs on login/logout and selection changes

  // Function to create a new note
  const createNewNote = async () => {
    if (!user) {
      showToast('You must be logged in to create notes', 'error');
      return;
    }

    try {
      const now = serverTimestamp();
      const newNoteData = {
        title: 'Untitled Note',
        contentHtml: '<p></p>',
        plainText: '',
        tags: [],
        subject: 'Other',
        createdBy: user.uid,
        createdAt: now,
        updatedAt: now,
        wordCount: 0,
        isArchived: false
      };

      const docRef = await addDoc(collection(db, 'notes'), newNoteData);
      // The onSnapshot listener will add the note to the list.
      // We just need to select it.
      setSelectedNoteId(docRef.id);
      showToast('New note created!', 'success');
    } catch (error) {
      console.error('❌ Error creating note:', error);
      showToast(`Failed to create note: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  // Function to delete a note
  const deleteNote = async (noteId: string) => {
    if (!user) {
      showToast('You must be logged in to delete notes', 'error');
      return;
    }

    const confirmed = window.confirm('Are you sure you want to delete this note?');
    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, 'notes', noteId));
      showToast('Note deleted successfully!', 'success');
      // The onSnapshot listener will handle removing it from the UI and updating selection.
    } catch (error) {
      console.error('❌ Error deleting note:', error);
      showToast(`Failed to delete note: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
    }
  };

  // Filter notes based on the search query
  const filteredNotes = notes.filter(note => {
    if (!note) return false;
    const query = searchQuery.toLowerCase();
    return (note.title || '').toLowerCase().includes(query) ||
           (note.plainText || '').toLowerCase().includes(query);
  });

  // Render login prompt if no user
  if (!user) {
    return (
      <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center">
        <div className="text-center">
          <DocumentTextIcon className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
          <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">Access Your Notes</h3>
          <p className="text-neutral-500 dark:text-neutral-400">Please log in to manage your notes.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 dark:bg-neutral-900 flex">
      {/* Left Sidebar - Notes List */}
      <div className="w-80 bg-white dark:bg-neutral-800 border-r border-neutral-200 dark:border-neutral-700 flex flex-col">
        {/* Search and New Note Button */}
        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
          <div className="relative mb-3">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-neutral-300 dark:border-neutral-600 rounded-lg bg-white dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100"
            />
          </div>
          <button
            onClick={createNewNote}
            className="w-full mt-3 flex items-center justify-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            New Note
          </button>
        </div>

        {/* Notes List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="mt-2 text-neutral-500 dark:text-neutral-400">Loading notes...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="p-4 text-center">
              <DocumentTextIcon className="mx-auto h-8 w-8 text-neutral-400 mb-2" />
              <p className="text-neutral-500 dark:text-neutral-400">No notes found</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {filteredNotes.map(note => (
                <div
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`p-3 rounded-lg cursor-pointer transition ${
                    selectedNoteId === note.id
                      ? 'bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700'
                      : 'hover:bg-neutral-50 dark:hover:bg-neutral-700'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-neutral-900 dark:text-neutral-100 truncate">
                        {note.title || 'Untitled'}
                      </h4>
                      <p className="text-sm text-neutral-500 dark:text-neutral-400 line-clamp-2 mt-1">
                        {note.plainText || 'No content'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent selecting the note when deleting
                        deleteNote(note.id);
                      }}
                      className="p-2 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-full"
                      title="Delete note"
                    >
                      <TrashIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Editor Area */}
      {selectedNoteId ? (
        <NoteEditorPanel
          key={selectedNoteId} // CRITICAL: Use key to force re-mount on note change
          noteId={selectedNoteId}
          onSaveSuccess={(message: string) => showToast(message, 'success')}
          onSaveError={(message: string) => showToast(message, 'error')}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-white dark:bg-neutral-800">
          <div className="text-center">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-neutral-400 mb-4" />
            <h3 className="text-lg font-medium text-neutral-900 dark:text-neutral-100 mb-2">
              Select a note
            </h3>
            <p className="text-neutral-500 dark:text-neutral-400">
              Choose a note from the sidebar or create a new one to begin.
            </p>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg shadow-lg transition-all duration-300 ${
          toast.type === 'success' ? 'bg-green-500 text-white' :
          toast.type === 'error' ? 'bg-red-500 text-white' :
          'bg-blue-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
};

export default Notes;

