import React, { useState, useEffect, useRef } from 'react';
import { ChevronRightIcon, ChevronDownIcon, DocumentTextIcon, RectangleStackIcon, QuestionMarkCircleIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline'; // Updated CollectionIcon to RectangleStackIcon
import { Link } from 'react-router-dom';

interface KnowledgeTreeNodeProps {
  node: KnowledgeNode;
  level: number;
  onAddChild: (parentId: string) => void;
  onEditNode: (nodeId: string, newTitle: string) => void;
  onDeleteNode: (nodeId: string) => void;
}

export interface KnowledgeNode {
  id: string;
  title: string;
  progress: number; // 0-100
  children?: KnowledgeNode[];
}

const KnowledgeTreeNode: React.FC<KnowledgeTreeNodeProps> = ({
  node,
  level,
  onAddChild,
  onEditNode,
  onDeleteNode,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState(node.title);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };

  const handleEditClick = () => {
    setIsEditing(true);
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditedTitle(e.target.value);
  };

  const handleSaveTitle = () => {
    if (editedTitle.trim() !== node.title) {
      onEditNode(node.id, editedTitle.trim());
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSaveTitle();
    } else if (e.key === 'Escape') {
      setEditedTitle(node.title);
      setIsEditing(false);
    }
  };

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const nodePaddingLeft = level * 20; // Indent children

  return (
    <div className="mb-2 ">
      <div
        className="flex items-center bg-white dark:bg-neutral-800 rounded-xl shadow-soft hover:shadow-md transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 cursor-pointer p-4"
        style={{ paddingLeft: `${nodePaddingLeft + 16}px` }} // Add base padding
      >
        <button
          onClick={handleToggleExpand}
          className="mr-2 text-neutral-500 dark:text-neutral-400 focus:outline-none transition-colors duration-150 ease-in-out"
        >
          {node.children && node.children.length > 0 ? (
            isExpanded ? (
              <ChevronDownIcon className="h-5 w-5" />
            ) : (
              <ChevronRightIcon className="h-5 w-5" />
            )
          ) : (
            <div className="h-5 w-5 opacity-0"></div> // Placeholder for alignment
          )}
        </button>

        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editedTitle}
            onChange={handleTitleChange}
            onBlur={handleSaveTitle}
            onKeyDown={handleKeyDown}
            className="flex-grow font-poppins text-lg font-medium bg-transparent focus:outline-none text-neutral-900 dark:text-neutral-100 border-b-2 border-primary-sky-blue focus:border-primary-sky-blue"
          />
        ) : (
          <h3 className="font-poppins text-lg font-medium text-neutral-900 dark:text-neutral-100 flex-grow" onDoubleClick={handleEditClick}>
            {node.title}
          </h3>
        )}

        <div className="w-24 bg-neutral-200 rounded-full h-2.5 dark:bg-neutral-700 mx-4 shadow-inner-soft">
          <div
            className="bg-secondary-green h-2.5 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${node.progress}%` }}
            role="progressbar"
            aria-valuenow={node.progress}
            aria-valuemin={0}
            aria-valuemax={100}
          ></div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-2 ml-4">
          <button
            onClick={() => onAddChild(node.id)}
            className="p-2 rounded-full text-primary-sky-blue hover:bg-primary-sky-blue hover:bg-opacity-10 dark:hover:bg-primary-sky-blue dark:hover:bg-opacity-20 transition duration-150 ease-in-out shadow-sm transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue"
            title="Add Subtopic"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
          <button
            onClick={() => onDeleteNode(node.id)}
            className="p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition duration-150 ease-in-out shadow-sm transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            title="Delete Topic"
          >
            <TrashIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Links to Features (Placeholder) */}
        <div className="flex space-x-2 ml-4">
          <Link to={`/notes?topic=${node.title}`}
            className="p-2 rounded-xl text-primary-sky-blue hover:bg-primary-sky-blue hover:bg-opacity-10 dark:hover:bg-primary-sky-blue dark:hover:bg-opacity-20 transition duration-150 ease-in-out shadow-sm transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-sky-blue"
            title="View Notes"
          >
            <DocumentTextIcon className="h-5 w-5" />
          </Link>
          <Link to={`/flashcards?topic=${node.title}`}
            className="p-2 rounded-xl text-accent-warm-orange hover:bg-accent-warm-orange hover:bg-opacity-10 dark:hover:bg-accent-warm-orange dark:hover:bg-opacity-20 transition duration-150 ease-in-out shadow-sm transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent-warm-orange"
            title="Review Flashcards"
          >
            <RectangleStackIcon className="h-5 w-5" />
          </Link>
          <Link to={`/quizzes?topic=${node.title}`}
            className="p-2 rounded-xl text-secondary-green hover:bg-secondary-green hover:bg-opacity-10 dark:hover:bg-secondary-green dark:hover:bg-opacity-20 transition duration-150 ease-in-out shadow-sm transform hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-green"
            title="Take Quiz"
          >
            <QuestionMarkCircleIcon className="h-5 w-5" />
          </Link>
        </div>
      </div>

      {isExpanded && node.children && node.children.length > 0 && (
        <div className="mt-2 pl-4">
          {node.children.map((childNode) => (
            <KnowledgeTreeNode
              key={childNode.id}
              node={childNode}
              level={level + 1}
              onAddChild={onAddChild}
              onEditNode={onEditNode}
              onDeleteNode={onDeleteNode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default KnowledgeTreeNode;
