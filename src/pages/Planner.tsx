import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db } from '../common/firebase';
import { collection, addDoc, query, orderBy, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { PlusIcon, TrashIcon } from '@heroicons/react/24/outline'; // Removed CheckCircleIcon and XCircleIcon
import { StudyPlanGenerator } from '../components/StudyPlanGenerator';

interface Task {
  id: string;
  title: string;
  description?: string;
  dueDate?: string;
  completed: boolean;
  createdAt: any;
}

const Planner: React.FC = () => {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  useEffect(() => {
    if (user) {
      const tasksRef = collection(db, `users/${user.uid}/tasks`);
      const q = query(tasksRef, orderBy('createdAt', 'desc'));

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const fetchedTasks: Task[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data() as Omit<Task, 'id'>
        }));
        setTasks(fetchedTasks);
      });

      return () => unsubscribe();
    }
  }, [user]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskTitle.trim() === '' || !user) return;

    try {
      await addDoc(collection(db, `users/${user.uid}/tasks`), {
        title: newTaskTitle,
        description: newTaskDescription,
        dueDate: newTaskDueDate,
        completed: false,
        createdAt: serverTimestamp(),
      });
      setNewTaskTitle('');
      setNewTaskDescription('');
      setNewTaskDueDate('');
    } catch (error) {
      console.error("Error adding task: ", error);
      alert("Failed to add task.");
    }
  };

  const handleToggleCompleted = async (task: Task) => {
    if (!user) return;
    try {
      const taskRef = doc(db, `users/${user.uid}/tasks`, task.id);
      await updateDoc(taskRef, {
        completed: !task.completed,
      });
    } catch (error) {
      console.error("Error toggling task status: ", error);
      alert("Failed to update task status.");
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!user) return;
    if (window.confirm('Are you sure you want to delete this task?')) {
      try {
        await deleteDoc(doc(db, `users/${user.uid}/tasks`, taskId));
      } catch (error) {
        console.error("Error deleting task: ", error);
        alert("Failed to delete task.");
      }
    }
  };

  const activeTasks = tasks.filter(task => !task.completed);
  const completedTasks = tasks.filter(task => task.completed);

  return (
    <div className="p-6 min-h-full bg-neutral-light dark:bg-neutral-dark font-sans">
      <h1 className="font-poppins text-3xl font-bold text-neutral-900 dark:text-neutral-100 mb-6">Your Planner</h1>

      <StudyPlanGenerator />

      <form onSubmit={handleAddTask} className="bg-white dark:bg-neutral-800 p-6 rounded-2xl shadow-soft mb-8 flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 items-center">
        <input
          type="text"
          placeholder="New task title..."
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          className="flex-1 w-full px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 transition duration-150 ease-in-out"
          required
        />
        <input
          type="text"
          placeholder="Description (optional)"
          value={newTaskDescription}
          onChange={(e) => setNewTaskDescription(e.target.value)}
          className="flex-1 w-full px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 placeholder-neutral-500 dark:placeholder-neutral-400 transition duration-150 ease-in-out"
        />
        <input
          type="date"
          value={newTaskDueDate}
          onChange={(e) => setNewTaskDueDate(e.target.value)}
          className="w-auto px-4 py-2.5 border-2 border-neutral-300 dark:border-neutral-600 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-sky-blue focus:border-primary-sky-blue bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 transition duration-150 ease-in-out"
        />
        <button
          type="submit"
          className="bg-secondary-green hover:bg-green-600 text-white font-sans font-medium py-2.5 px-6 rounded-xl shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-secondary-green flex items-center justify-center transition duration-150 ease-in-out transform hover:-translate-y-0.5"
        >
          <PlusIcon className="h-5 w-5 mr-2" /> Add Task
        </button>
      </form>

      {activeTasks.length > 0 && (
        <section className="mb-8">
          <h2 className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Active Tasks ({activeTasks.length})</h2>
          <div className="space-y-4">
            {activeTasks.map(task => (
              <div key={task.id} className="bg-white dark:bg-neutral-800 p-5 rounded-2xl shadow-soft flex items-center justify-between transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center flex-1">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleCompleted(task)}
                    className="form-checkbox h-6 w-6 text-primary-sky-blue rounded-lg focus:ring-primary-sky-blue dark:bg-neutral-700 dark:border-neutral-600 dark:checked:bg-primary-sky-blue dark:focus:ring-primary-sky-blue transition duration-150 ease-in-out"
                  />
                  <div className="ml-4 flex-1">
                    <h3 className="font-poppins text-lg font-medium text-neutral-900 dark:text-neutral-100">{task.title}</h3>
                    {task.description && <p className="font-inter text-sm text-neutral-600 dark:text-neutral-400 mt-1">{task.description}</p>}
                    {task.dueDate && <p className="font-inter text-xs text-neutral-500 dark:text-neutral-400 mt-1">Due: {task.dueDate}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="ml-4 p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition duration-150 ease-in-out"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {completedTasks.length > 0 && (
        <section>
          <h2 className="font-poppins text-2xl font-semibold text-neutral-900 dark:text-neutral-100 mb-4">Completed Tasks ({completedTasks.length})</h2>
          <div className="space-y-4">
            {completedTasks.map(task => (
              <div key={task.id} className="bg-white dark:bg-neutral-800 p-5 rounded-2xl shadow-soft flex items-center justify-between opacity-80 transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-center flex-1">
                  <input
                    type="checkbox"
                    checked={task.completed}
                    onChange={() => handleToggleCompleted(task)}
                    className="form-checkbox h-6 w-6 text-primary-sky-blue rounded-lg focus:ring-primary-sky-blue dark:bg-neutral-700 dark:border-neutral-600 dark:checked:bg-primary-sky-blue dark:focus:ring-primary-sky-blue transition duration-150 ease-in-out"
                  />
                  <div className="ml-4 flex-1">
                    <h3 className="font-poppins text-lg font-medium text-neutral-500 dark:text-neutral-400 line-through">{task.title}</h3>
                    {task.description && <p className="font-inter text-sm text-neutral-500 dark:text-neutral-500 mt-1 line-through">{task.description}</p>}
                    {task.dueDate && <p className="font-inter text-xs text-neutral-500 dark:text-neutral-500 mt-1 line-through">Due: {task.dueDate}</p>}
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteTask(task.id)}
                  className="ml-4 p-2 rounded-full text-red-500 hover:bg-red-100 dark:hover:bg-red-900 transition duration-150 ease-in-out"
                >
                  <TrashIcon className="h-5 w-5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {(activeTasks.length === 0 && completedTasks.length === 0 && user) && (
        <p className="font-sans text-center text-neutral-500 dark:text-neutral-400 mt-10">No tasks yet! Add your first task above to get started.</p>
      )}
      {!user && (
        <p className="font-sans text-center text-red-500 dark:text-red-400 mt-10">Please log in to manage your tasks.</p>
      )}
    </div>
  );
};

export default Planner;
