import { db } from '../common/firebase';
import { doc, setDoc, onSnapshot, serverTimestamp, deleteDoc, collection } from 'firebase/firestore';

interface PresenceData {
  lastActive: any; // serverTimestamp
  currentDeckId?: string;
  displayName?: string;
  photoURL?: string;
}

const presenceCollection = (uid: string) => doc(db, `presence/${uid}`);

export const PresenceService = {
  /**
   * Updates the current user's presence status.
   * @param uid The user's UID.
   * @param data The presence data to update.
   */
  async updatePresence(uid: string, data: Partial<PresenceData>) {
    await setDoc(presenceCollection(uid), { ...data, lastActive: serverTimestamp() }, { merge: true });
  },

  /**
   * Clears the current user's presence status.
   * @param uid The user's UID.
   */
  async clearPresence(uid: string) {
    await deleteDoc(presenceCollection(uid));
  },

  /**
   * Listens to the presence of a specific user.
   * @param uid The user's UID.
   * @param cb Callback function to receive presence data.
   * @returns An unsubscribe function.
   */
  listenToUserPresence(uid: string, cb: (data: PresenceData | null) => void) {
    return onSnapshot(presenceCollection(uid), (snapshot) => {
      cb(snapshot.exists() ? (snapshot.data() as PresenceData) : null);
    });
  },

  /**
   * Listens to the presence of all users.
   * @param cb Callback function to receive a map of UID to PresenceData.
   * @returns An unsubscribe function.
   */
  listenToAllPresence(cb: (presenceMap: Map<string, PresenceData>) => void) {
    return onSnapshot(collection(db, 'presence'), (snapshot) => {
      const presenceMap = new Map<string, PresenceData>();
      snapshot.docs.forEach((docSnap) => {
        presenceMap.set(docSnap.id, docSnap.data() as PresenceData);
      });
      cb(presenceMap);
    });
  },
};
