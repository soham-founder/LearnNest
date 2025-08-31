import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  query,
  orderBy,
} from 'firebase/firestore';
import KnowledgeTreeSidebar from '../components/KnowledgeTreeSidebar';
import KnowledgeTreeNode, { type KnowledgeNode } from '../components/KnowledgeTreeNode';
import { PlusIcon } from '@heroicons/react/24/outline';

const subjects = ['Math', 'Physics', 'Chemistry', 'Biology', 'CS'];

// Firestore document shape (includes createdAt), UI component type excludes it
type KnowledgeNodeDoc = Omit<KnowledgeNode, 'id'> & { createdAt?: any };

const KnowledgeTree: React.FC = () => {
  const { user } = useAuth();
  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [knowledgeTree, setKnowledgeTree] = useState<KnowledgeNode[]>([]);
  const [loadingTree, setLoadingTree] = useState(false);
  // AI suggestion feature removed for now to reduce complexity and avoid unused code

  useEffect(() => {
    if (user && selectedSubject) {
      setLoadingTree(true);
      const treeRef = collection(db, `users/${user.uid}/knowledgeTree/${selectedSubject}/nodes`);
      const q = query(treeRef, orderBy('createdAt', 'asc')); // Order by creation to maintain some order

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedNodes: KnowledgeNode[] = snapshot.docs.map(d => {
          const data = d.data() as KnowledgeNodeDoc;
          return {
            id: d.id,
            title: data.title,
            progress: data.progress,
            children: data.children || [],
          };
        });
        setKnowledgeTree(fetchedNodes);
        setLoadingTree(false);
      }, (error) => {
        console.error("Error fetching knowledge tree: ", error);
        alert("Failed to load knowledge tree.");
        setLoadingTree(false);
      });

      return () => unsubscribe();
    } else {
      setKnowledgeTree([]);
    }
  }, [user, selectedSubject]);

  // Helper to find and update a node in the tree recursively
  const updateNodeInTree = (nodes: KnowledgeNode[], nodeId: string, updates: Partial<KnowledgeNode>): KnowledgeNode[] => {
    return nodes.map(node => {
      if (node.id === nodeId) {
        return { ...node, ...updates };
      } else if (node.children && node.children.length > 0) {
        return { ...node, children: updateNodeInTree(node.children, nodeId, updates) };
      }
      return node;
    });
  };

  // Helper to find and delete a node in the tree recursively
  const deleteNodeInTree = (nodes: KnowledgeNode[], nodeIdToDelete: string): KnowledgeNode[] => {
    return nodes.filter(node => node.id !== nodeIdToDelete).map(node => {
      if (node.children && node.children.length > 0) {
        return { ...node, children: deleteNodeInTree(node.children, nodeIdToDelete) };
      }
      return node;
    });
  };

  const addNode = async (parentId: string | null) => {
    if (!user || !selectedSubject) return;

  const newNode: KnowledgeNodeDoc = {
      title: 'New Topic',
      progress: 0,
      children: [],
      createdAt: serverTimestamp(), // Add timestamp for ordering
    };

    try {
      if (parentId) {
        // Add as child to existing node
        const parentNode = findNodeById(knowledgeTree, parentId);
        if (parentNode) {
          const newChildRef = await addDoc(collection(db, `users/${user.uid}/knowledgeTree/${selectedSubject}/nodes`), newNode);
          const updatedParent = { ...parentNode, children: [...(parentNode.children || []), { ...newNode, id: newChildRef.id }] };
          // This is a simplified approach. For true nested Firestore, you'd update the parent document.
          // For this flat collection approach, we'll re-fetch the whole tree to update state.
          // A better way would be to update the 'children' array in the parent document in Firestore.
          // For MVP, onSnapshot re-fetching handles it.
          await updateDoc(doc(db, `users/${user.uid}/knowledgeTree/${selectedSubject}/nodes`, parentId), {
            children: updatedParent.children,
          });
        }
      } else {
        // Add as root node
        await addDoc(collection(db, `users/${user.uid}/knowledgeTree/${selectedSubject}/nodes`), newNode);
      }
    } catch (error) {
      console.error("Error adding node: ", error);
      alert("Failed to add node.");
    }
  };

  const findNodeById = (nodes: KnowledgeNode[], id: string): KnowledgeNode | undefined => {
    for (const node of nodes) {
      if (node.id === id) {
        return node;
      }
      if (node.children) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return undefined;
  };

  const handleEditNode = async (nodeId: string, newTitle: string) => {
    if (!user || !selectedSubject) return;
    try {
      await updateDoc(doc(db, `users/${user.uid}/knowledgeTree/${selectedSubject}/nodes`, nodeId), {
        title: newTitle,
      });
    } catch (error) {
      console.error("Error editing node: ", error);
      alert("Failed to edit node.");
    }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!user || !selectedSubject) return;
    if (window.confirm('Are you sure you want to delete this topic and all its subtopics?')) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/knowledgeTree/${selectedSubject}/nodes`, nodeId));
        // Note: For actual nested deletion in Firestore, you would need to iterate and delete children recursively
        // For this flat collection, deleting the parent doc is sufficient.
      } catch (error) {
        console.error("Error deleting node: ", error);
        alert("Failed to delete node.");
      }
    }
  };

  // AI suggestion functions removed

  if (!user) {
    return (
      <div className="p-6 flex items-center justify-center h-full bg-neutral-light dark:bg-neutral-dark font-inter">
        <p className="text-center text-red-500 dark:text-red-400 text-lg">Please log in to manage your Knowledge Tree.</p>
      </div>
    );
  }

  return (
    <div className="p-6 min-h-full bg-neutral-light dark:bg-neutral-dark font-inter flex flex-col md:flex-row">
      <KnowledgeTreeSidebar
        subjects={subjects}
        onSelectSubject={setSelectedSubject}
        selectedSubject={selectedSubject}
      />

      <div className="flex-1 flex flex-col bg-white dark:bg-neutral-800 rounded-2xl shadow-soft p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="font-poppins text-3xl font-bold text-neutral-900 dark:text-neutral-100">Knowledge Tree {selectedSubject ? `for ${selectedSubject}` : ''}</h1>
          {selectedSubject && (
            <button
              onClick={() => addNode(null)} // Add root node
              className="bg-primary-sky-blue hover:bg-blue-700 text-white font-inter font-medium py-2 px-4 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue transition duration-150 ease-in-out transform hover:-translate-y-0.5"
            >
              <PlusIcon className="h-5 w-5 mr-2" /> New Root Topic
            </button>
          )}
        </div>

        {!selectedSubject ? (
          <div className="flex-1 flex items-center justify-center font-inter">
            <p className="text-neutral-500 dark:text-neutral-400 text-lg">Select a subject from the sidebar to view or create its knowledge tree.</p>
          </div>
        ) : loadingTree ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary-sky-blue border-t-transparent rounded-full animate-spin"></div>
            <p className="ml-3 font-inter text-neutral-600 dark:text-neutral-400">Loading knowledge tree...</p>
          </div>
        ) : (knowledgeTree.length === 0 && !loadingTree) ? (
          <div className="flex-1 flex flex-col items-center justify-center font-inter">
            <p className="text-neutral-500 dark:text-neutral-400 text-lg mb-4">No topics found for {selectedSubject}.</p>
            <button
              onClick={() => addNode(null)}
              className="bg-primary-sky-blue hover:bg-blue-700 text-white font-inter font-medium py-2 px-4 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue transition duration-150 ease-in-out transform hover:-translate-y-0.5"
            >
              <PlusIcon className="h-5 w-5 mr-2" /> Create First Topic
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {knowledgeTree.map((node) => (
              <KnowledgeTreeNode
                key={node.id}
                node={node}
                level={0}
                onAddChild={addNode}
                onEditNode={handleEditNode}
                onDeleteNode={handleDeleteNode}
              />
            ))}
          </div>
        )}

  {/* AI suggestion UI removed */}
      </div>
    </div>
  );
};

export default KnowledgeTree;
