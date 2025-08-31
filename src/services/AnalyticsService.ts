import { db } from '../common/firebase';
import { doc, increment, serverTimestamp, setDoc, getDoc, updateDoc } from 'firebase/firestore';

export const AnalyticsService = {
  async addReview(uid: string, dateKey: string, correct: boolean, seconds: number, xp: number) {
    const ref = doc(db, `users/${uid}/analytics/${dateKey}`);
    const exists = await getDoc(ref);
    if (!exists.exists()) {
      await setDoc(ref, {
        date: dateKey,
        reviews: 0,
        correct: 0,
        timeStudiedSec: 0,
        newCards: 0,
        xpEarned: 0,
        streak: 0,
        updatedAt: serverTimestamp(),
      });
    }
    await updateDoc(ref, {
      reviews: increment(1),
      correct: increment(correct ? 1 : 0),
      timeStudiedSec: increment(seconds),
      xpEarned: increment(xp),
      updatedAt: serverTimestamp(),
    });
  },
};
