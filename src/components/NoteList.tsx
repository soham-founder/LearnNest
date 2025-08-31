import React from 'react';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline';

interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: any;
  updatedAt: any;
}

interface NoteListProps {
  notes: Note[];
  onSelectNote: (noteId: string) => void;
  onNewNote: () => void;
  onDeleteNote: (noteId: string) => void;
  selectedNoteId: string | null;
}

const NoteList: React.FC<NoteListProps> = ({
  notes,
  onSelectNote,
  onNewNote,
  onDeleteNote,
  selectedNoteId,
}) => {
  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate();
    return date.toLocaleString();
  };

  const getPreview = (content: string) => {
    const plainText = content.replace(/<[^>]+>/g, ''); // Remove HTML tags if present (from rich text editor previously)
    return plainText.substring(0, 100) + (plainText.length > 100 ? '...' : '');
  };

  return (
    <div className="w-80 bg-charcoal-dark border-r border-gray-600 h-full flex flex-col">
      {/* Header Section */}
      <div className="p-6 border-b border-gray-600 flex-shrink-0">
        <h2 className="font-poppins text-2xl font-bold text-neutral-100 mb-4">Notes</h2>
        <button
          onClick={onNewNote}
          className="w-full bg-primary-sky-blue hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue flex items-center justify-center transition-all duration-200 ease-in-out transform hover:scale-[1.02]"
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          New Note
        </button>
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {notes.length === 0 ? (
          <div className="text-center py-12">
            <div className="mb-4">
              <svg className="mx-auto h-12 w-12 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-neutral-400 text-sm">No notes yet</p>
            <p className="text-neutral-500 text-xs mt-1">Click "New Note" to get started</p>
          </div>
        ) : (
          notes.map((note) => (
            <div
              key={note.id}
              className={`p-4 rounded-lg cursor-pointer transition-all duration-200 ease-in-out hover:transform hover:scale-[1.02] ${
                selectedNoteId === note.id
                  ? 'bg-primary-sky-blue bg-opacity-20 border border-primary-sky-blue shadow-lg'
                  : 'bg-charcoal-light hover:bg-gray-700 border border-transparent'
              }`}
              onClick={() => onSelectNote(note.id)}
            >
              {/* Note Header */}
              <div className="flex items-start justify-between mb-3">
                <h3 className="font-semibold text-neutral-100 text-base leading-tight flex-1 pr-2 line-clamp-2">
                  {note.title || 'Untitled Note'}
                </h3>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(note.id);
                  }}
                  className="p-1.5 rounded-md text-neutral-400 hover:text-red-400 hover:bg-red-500 hover:bg-opacity-10 transition-all duration-150 ease-in-out flex-shrink-0"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>

              {/* Note Preview */}
              <p className="text-sm text-neutral-300 mb-3 line-clamp-3 leading-relaxed">
                {getPreview(note.content) || 'No content preview available...'}
              </p>

              {/* Note Footer */}
              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span className="flex items-center">
                  <svg className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {formatTimestamp(note.updatedAt) ? formatTimestamp(note.updatedAt).split(',')[0] : 'Recent'}
                </span>
                <span className="text-neutral-600">
                  {note.content.length} chars
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NoteList;
