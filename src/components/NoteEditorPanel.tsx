import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../common/firebase';
import { doc, onSnapshot, updateDoc, serverTimestamp, Timestamp } from 'firebase/firestore';
import { SparklesIcon, ChevronRightIcon, DocumentTextIcon, ListBulletIcon } from '@heroicons/react/24/outline';
import { NoteAIService } from '../services/NoteAIService';

/**
 * Represents the full structure of a Note document in Firestore.
 */
interface NoteDocument {
    id: string;
    title: string;
    contentHtml: string;
    plainText: string;
    tags: string[];
    subject: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    wordCount: number;
    isArchived: boolean;
    // Add other fields from your full Note type if needed for the editor
}

/**
 * Props for the NoteEditorPanel component.
 */
interface NoteEditorPanelProps {
    noteId: string;
    onSaveSuccess: (message: string) => void;
    onSaveError: (message: string) => void;
}

// Debounce utility to delay function execution
const debounce = <F extends (...args: any[]) => any>(func: F, waitFor: number) => {
    let timeout: NodeJS.Timeout;
    return (...args: Parameters<F>): Promise<ReturnType<F>> =>
        new Promise(resolve => {
            clearTimeout(timeout);
            timeout = setTimeout(() => resolve(func(...args)), waitFor);
        });
};

/**
 * A self-contained component for editing a single note.
 * It fetches its own data, manages its own state, and handles auto-saving.
 * This isolation prevents the race conditions that caused the original bug.
 */
export const NoteEditorPanel: React.FC<NoteEditorPanelProps> = ({ noteId, onSaveSuccess, onSaveError }) => {
    const [note, setNote] = useState<NoteDocument | null>(null);
    const [editorContent, setEditorContent] = useState('');
    const [editorTitle, setEditorTitle] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [showAIPanel, setShowAIPanel] = useState(true);

    // AI-related state
    const [aiSummary, setAiSummary] = useState<string | null>(null);
    const [aiActionItems, setAiActionItems] = useState<string[] | null>(null);
    const [isAISummarizing, setIsAISummarizing] = useState(false);
    const [isAIExtractingActions, setIsAIExtractingActions] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);


    // Ref to track if the component is still mounted
    const isMounted = useRef(true);
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    }, []);

    // Debounced save function
    const debouncedSave = useCallback(
        debounce(async (id: string, title: string, content: string) => {
            if (!isMounted.current) return;
            setIsSaving(true);
            try {
                const plainText = content.replace(/<[^>]*>/g, '');
                const wordCount = plainText.trim().split(/\s+/).filter(Boolean).length;

                const noteRef = doc(db, 'notes', id);
                await updateDoc(noteRef, {
                    title,
                    contentHtml: content,
                    plainText,
                    wordCount,
                    updatedAt: serverTimestamp(),
                });
                if (isMounted.current) {
                    onSaveSuccess('Note saved automatically.');
                }
            } catch (err) {
                console.error('❌ Auto-save error:', err);
                if (isMounted.current) {
                    onSaveError(`Auto-save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
                }
            } finally {
                if (isMounted.current) {
                    setIsSaving(false);
                }
            }
        }, 1500), // 1.5-second debounce delay
        [onSaveSuccess, onSaveError]
    );

    // Effect to listen for changes to the specific note document
    useEffect(() => {
        setIsLoading(true);
        setError(null);

        const noteRef = doc(db, 'notes', noteId);
        const unsubscribe = onSnapshot(noteRef, (docSnapshot) => {
            if (!isMounted.current) return;

            if (docSnapshot.exists()) {
                const data = { id: docSnapshot.id, ...docSnapshot.data() } as NoteDocument;
                setNote(data);
                setEditorTitle(data.title);
                // Only update content if it's not currently being edited, to avoid cursor jumps
                setEditorContent(prevContent => {
                    // This simple check helps, but for rich text editors, more complex logic is needed
                    if (prevContent.length !== data.contentHtml.length) {
                        return data.contentHtml;
                    }
                    return prevContent;
                });
                setError(null);
            } else {
                setError('Note not found. It may have been deleted.');
                setNote(null);
            }
            setIsLoading(false);
        }, (err) => {
            console.error('❌ Firestore subscription error:', err);
            if (isMounted.current) {
                setError(`Failed to load note: ${err.message}`);
                setIsLoading(false);
            }
        });

        return () => unsubscribe();
    }, [noteId]); // Re-subscribes if the noteId prop changes

    // Handler for editor content changes
    const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newContent = e.target.value;
        setEditorContent(newContent);
        debouncedSave(noteId, editorTitle, newContent);
    };

    // Handler for editor title changes
    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newTitle = e.target.value;
        setEditorTitle(newTitle);
        debouncedSave(noteId, newTitle, editorContent);
    };

    // AI Action Handlers
    const handleGenerateSummary = async () => {
        if (!editorContent.trim() || isAISummarizing) return;
        setIsAISummarizing(true);
        setAiError(null);
        setAiSummary(null);
        try {
            const summary = await NoteAIService.getSummary(editorContent);
            if (isMounted.current) setAiSummary(summary);
        } catch (err) {
            if (isMounted.current) setAiError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            if (isMounted.current) setIsAISummarizing(false);
        }
    };

    const handleExtractActionItems = async () => {
        if (!editorContent.trim() || isAIExtractingActions) return;
        setIsAIExtractingActions(true);
        setAiError(null);
        setAiActionItems(null);
        try {
            const items = await NoteAIService.getActionItems(editorContent);
            if (isMounted.current) setAiActionItems(items);
        } catch (err) {
            if (isMounted.current) setAiError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            if (isMounted.current) setIsAIExtractingActions(false);
        }
    };


    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-neutral-800">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex items-center justify-center bg-red-50 dark:bg-red-900/20 p-4">
                <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
        );
    }

    if (!note) {
        return (
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-neutral-800">
                <p className="text-neutral-500">Please select a note.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col bg-white dark:bg-neutral-800">
            {/* Editor Header */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
                <div className="flex items-center justify-between">
                    <input
                        type="text"
                        value={editorTitle}
                        onChange={handleTitleChange}
                        placeholder="Note Title"
                        className="text-xl font-semibold bg-transparent w-full border-none outline-none text-neutral-900 dark:text-neutral-100"
                    />
                    <div className="flex items-center space-x-2">
                        {isSaving && <span className="text-xs text-neutral-400 animate-pulse">Saving...</span>}
                        <button
                            onClick={() => setShowAIPanel(!showAIPanel)}
                            className="p-2 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg"
                        >
                            <SparklesIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Editor Body */}
            <div className="flex-1 flex">
                <textarea
                    value={editorContent}
                    onChange={handleContentChange}
                    placeholder="Start writing..."
                    className="w-full h-full resize-none p-4 border-none outline-none bg-transparent text-neutral-900 dark:text-neutral-100"
                />

                {/* AI Panel */}
                {showAIPanel && (
                    <div className="w-80 bg-neutral-50 dark:bg-neutral-900/50 border-l border-neutral-200 dark:border-neutral-700 flex flex-col">
                        <div className="p-4 border-b border-neutral-200 dark:border-neutral-700">
                            <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-neutral-900 dark:text-neutral-100 flex items-center">
                                    <SparklesIcon className="h-5 w-5 mr-2 text-purple-500" />
                                    AI Assistant
                                </h3>
                                <button
                                    onClick={() => setShowAIPanel(false)}
                                    className="p-1 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                                >
                                    <ChevronRightIcon className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-6">
                            {/* AI Actions */}
                            <div className="space-y-3">
                                <button
                                    onClick={handleGenerateSummary}
                                    disabled={isAISummarizing || !editorContent.trim()}
                                    className="w-full flex items-center justify-center px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition disabled:bg-blue-300 dark:disabled:bg-blue-800 disabled:cursor-not-allowed"
                                >
                                    {isAISummarizing ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    ) : (
                                        <DocumentTextIcon className="h-4 w-4 mr-2" />
                                    )}
                                    <span className="ml-2">Generate Summary</span>
                                </button>
                                <button
                                    onClick={handleExtractActionItems}
                                    disabled={isAIExtractingActions || !editorContent.trim()}
                                    className="w-full flex items-center justify-center px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition disabled:bg-green-300 dark:disabled:bg-green-800 disabled:cursor-not-allowed"
                                >
                                    {isAIExtractingActions ? (
                                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                    ) : (
                                        <ListBulletIcon className="h-4 w-4 mr-2" />
                                    )}
                                    <span className="ml-2">Extract Actions</span>
                                </button>
                            </div>

                            {/* AI Output */}
                            <div className="space-y-4">
                                {aiError && (
                                    <div className="p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                        <p className="text-sm text-red-700 dark:text-red-300">{aiError}</p>
                                    </div>
                                )}
                                {aiSummary && (
                                    <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                                        <h4 className="font-semibold text-sm text-blue-800 dark:text-blue-200 mb-2">Summary</h4>
                                        <p className="text-sm text-blue-700 dark:text-blue-300 whitespace-pre-wrap">{aiSummary}</p>
                                    </div>
                                )}
                                {aiActionItems && aiActionItems.length > 0 && (
                                    <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-lg">
                                        <h4 className="font-semibold text-sm text-green-800 dark:text-green-200 mb-2">Action Items</h4>
                                        <ul className="space-y-1 list-disc list-inside">
                                            {aiActionItems.map((item, index) => (
                                                <li key={index} className="text-sm text-green-700 dark:text-green-300">{item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                                 {aiActionItems && aiActionItems.length === 0 && (
                                    <div className="p-3 bg-yellow-50 dark:bg-yellow-900/30 rounded-lg">
                                        <p className="text-sm text-yellow-700 dark:text-yellow-300">No action items were found in the note.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
