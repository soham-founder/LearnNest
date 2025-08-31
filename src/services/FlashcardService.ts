import { db } from '../common/firebase';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getCountFromServer,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  arrayUnion,
  arrayRemove,
  where,
  writeBatch,
} from 'firebase/firestore';
import type { CardId, Deck, DeckId, Flashcard, SRSData, CardRating, AIJob, AnalyticsRecord, AIJobStatus } from '../types/flashcards';
// Added for image upload utility
import imageCompression from 'browser-image-compression';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../common/firebase';

const userPath = (uid: string) => `users/${uid}`;
// Decks live under users/{uid}/flashcards, with a subcollection `cards` per deck
const decksCol = (uid: string) => collection(db, `${userPath(uid)}/flashcards`);
// Cards: users/{uid}/flashcards/{deckId}/cards/{cardId}
const cardsCol = (uid: string, deckId: DeckId) => collection(db, `${userPath(uid)}/flashcards/${deckId}/cards`);
// Analytics: users/{uid}/flashcards/{deckId}/analytics
const analyticsCol = (uid: string, deckId: DeckId) => collection(db, `${userPath(uid)}/flashcards/${deckId}/analytics`);
// AI Jobs: users/{uid}/aiJobs
const aiJobsCol = (uid: string) => collection(db, `${userPath(uid)}/aiJobs`);

export const FlashcardService = {
  // Decks
  async createDeck(uid: string, name: string, description?: string, tags?: string[]): Promise<DeckId> {
    const now = serverTimestamp();
    // Default position to current timestamp for stable ordering at creation
    const ref = await addDoc(decksCol(uid), {
      name,
      description: description || '',
      tags: tags || [],
      position: Date.now(),
      createdAt: now,
      updatedAt: now,
    });
    return ref.id as DeckId;
  },

  async getDeck(uid: string, deckId: DeckId): Promise<Deck | null> {
    const snap = await getDoc(doc(db, `${userPath(uid)}/flashcards/${deckId}`));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Deck) : null;
  },

  async updateDeck(uid: string, deckId: DeckId, data: Partial<Deck>) {
  await updateDoc(doc(db, `${userPath(uid)}/flashcards/${deckId}`), { ...data, updatedAt: serverTimestamp() });
  },

  async deleteDeck(uid: string, deckId: DeckId) {
    // Cascade delete all cards in this deck (batched)
    const cardsSnapshot = await getDocs(cardsCol(uid, deckId));
    let batch = writeBatch(db);
    let opCount = 0;
    for (const d of cardsSnapshot.docs) {
      batch.delete(d.ref);
      opCount++;
      if (opCount === 450) { // safety chunk
        await batch.commit();
        batch = writeBatch(db);
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();
    // Cascade delete analytics records for this deck
    const analyticsSnap = await getDocs(analyticsCol(uid, deckId));
    if (!analyticsSnap.empty) {
      let aBatch = writeBatch(db);
      let delCount = 0;
      for (const d of analyticsSnap.docs) {
        aBatch.delete(d.ref);
        delCount++;
        if (delCount === 450) {
          await aBatch.commit();
          aBatch = writeBatch(db);
          delCount = 0;
        }
      }
      if (delCount > 0) await aBatch.commit();
    }
    // Delete the deck document itself
    await deleteDoc(doc(db, `${userPath(uid)}/flashcards/${deckId}`));
  },

  listenDecks(uid: string, cb: (decks: Deck[]) => void) {
  const q = query(decksCol(uid), orderBy('position', 'asc'), orderBy('updatedAt', 'desc'));
    return onSnapshot(q, (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Deck, 'id'>) })));
    });
  },

  async reorderDecks(uid: string, orderedIds: DeckId[]) {
    // Assign sequential positions spaced by 100 to allow future insertions
    const batch = writeBatch(db);
    const base = 1000;
    orderedIds.forEach((id, idx) => {
      const pos = base + idx * 100;
      batch.update(doc(db, `${userPath(uid)}/flashcards/${id}`), { position: pos, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  },

  // Analytics
  async recordAnalytics(uid: string, deckId: DeckId, record: Omit<AnalyticsRecord, 'id' | 'userId'>) {
    await addDoc(analyticsCol(uid, deckId), {
      ...record,
      userId: uid,
      createdAt: serverTimestamp(),
    } as any);
  },

  listenAnalytics(uid: string, deckId: DeckId, opts: { start?: Timestamp; end?: Timestamp } | undefined, cb: (rows: AnalyticsRecord[]) => void) {
    const clauses: any[] = [];
    if (opts?.start) clauses.push(where('reviewedAt', '>=', opts.start));
    if (opts?.end) clauses.push(where('reviewedAt', '<=', opts.end));
    const qy = query(analyticsCol(uid, deckId), ...clauses, orderBy('reviewedAt', 'desc'));
    return onSnapshot(qy, (snap) => {
      const items: AnalyticsRecord[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      cb(items);
    });
  },

  // AI Jobs
  async createAIJob(uid: string, input: AIJob['input'], type: AIJob['type']): Promise<string> {
    const now = serverTimestamp();
    const ref = await addDoc(aiJobsCol(uid), {
      userId: uid,
      status: 'queued' as AIJobStatus,
      type,
      input,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  },

  async updateAIJob(uid: string, jobId: string, data: Partial<Omit<AIJob, 'id' | 'userId'>>) {
    await updateDoc(doc(db, `${userPath(uid)}/aiJobs/${jobId}`), { ...data, updatedAt: serverTimestamp() } as any);
  },

  async getAIJob(uid: string, jobId: string): Promise<AIJob | null> {
    const snap = await getDoc(doc(db, `${userPath(uid)}/aiJobs/${jobId}`));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as AIJob) : null;
  },

  async deleteAIJob(uid: string, jobId: string) {
    await deleteDoc(doc(db, `${userPath(uid)}/aiJobs/${jobId}`));
  },

  listenAIJobs(uid: string, opts: { deckId?: DeckId; statusIn?: AIJobStatus[] } | undefined, cb: (jobs: AIJob[]) => void) {
    const filters: any[] = [];
    if (opts?.deckId) filters.push(where('input.deckId', '==', opts.deckId));
    if (opts?.statusIn && opts.statusIn.length) filters.push(where('status', 'in', opts.statusIn));
    const qy = query(aiJobsCol(uid), ...filters, orderBy('updatedAt', 'desc'));
    return onSnapshot(qy, (snap) => {
      cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AIJob)));
    });
  },

  // Cards
  async addCard(uid: string, deckId: DeckId, card: Omit<Flashcard, 'id' | 'createdAt' | 'updatedAt'>): Promise<CardId> {
    const now = serverTimestamp();
    // default ordering position
    const ref = await addDoc(cardsCol(uid, deckId), { position: Date.now(), ...card, createdAt: now, updatedAt: now });
    return ref.id as CardId;
  },

  async getCard(uid: string, deckId: DeckId, cardId: CardId): Promise<Flashcard | null> {
    const snap = await getDoc(doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${cardId}`));
    return snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as Flashcard) : null;
  },

  async updateCard(uid: string, deckId: DeckId, cardId: CardId, data: Partial<Flashcard>) {
    await updateDoc(doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${cardId}`), { ...data, updatedAt: serverTimestamp() });
  },

  async getAnalyticsRange(uid: string, deckId: DeckId, start?: Timestamp, end?: Timestamp): Promise<AnalyticsRecord[]> {
    const clauses: any[] = [];
    if (start) clauses.push(where('reviewedAt', '>=', start));
    if (end) clauses.push(where('reviewedAt', '<=', end));
    const qy = query(analyticsCol(uid, deckId), ...clauses, orderBy('reviewedAt', 'desc'));
    const snap = await getDocs(qy);
    return snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as AnalyticsRecord));
  },

  async deleteCard(uid: string, deckId: DeckId, cardId: CardId) {
    await deleteDoc(doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${cardId}`));
  },

  // New: batch delete multiple cards from a deck
  async deleteCards(uid: string, deckId: DeckId, cardIds: CardId[]) {
    if (!cardIds || cardIds.length === 0) return;
    let batch = writeBatch(db);
    let ops = 0;
    for (const id of cardIds) {
      batch.delete(doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${id}`));
      ops++;
      if (ops === 450) {
        await batch.commit();
        batch = writeBatch(db);
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();
  },

  // New: move multiple cards between decks
  async moveCards(uid: string, cardIds: CardId[], fromDeck: DeckId, toDeck: DeckId) {
    if (!cardIds || cardIds.length === 0) return;
    if (fromDeck === toDeck) return;
    for (const cardId of cardIds) {
      await this.moveCard(uid, fromDeck, toDeck, cardId);
    }
  },

  // Bulk: add tags to many cards (deduplicated by Firestore arrayUnion)
  async addTagsToCards(uid: string, deckId: DeckId, cardIds: CardId[], tags: string[]) {
    const t = (tags || []).map(s => String(s).trim().toLowerCase()).filter(Boolean);
    if (!cardIds?.length || !t.length) return;
    let batch = writeBatch(db);
    let ops = 0;
    for (const id of cardIds) {
      const ref = doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${id}`);
      batch.update(ref, { tags: arrayUnion(...t), updatedAt: serverTimestamp() } as any);
      ops++;
      if (ops === 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  },

  // Bulk: remove tags from many cards
  async removeTagsFromCards(uid: string, deckId: DeckId, cardIds: CardId[], tags: string[]) {
    const t = (tags || []).map(s => String(s).trim().toLowerCase()).filter(Boolean);
    if (!cardIds?.length || !t.length) return;
    let batch = writeBatch(db);
    let ops = 0;
    for (const id of cardIds) {
      const ref = doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${id}`);
      batch.update(ref, { tags: arrayRemove(...t), updatedAt: serverTimestamp() } as any);
      ops++;
      if (ops === 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
    }
    if (ops > 0) await batch.commit();
  },

  listenCards(uid: string, deckId: DeckId, cb: (cards: Flashcard[]) => void) {
    const q = query(cardsCol(uid, deckId), orderBy('srs.dueDate', 'asc'));
    return onSnapshot(q, (snap) => {
  const items: Flashcard[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Flashcard));
  cb(items);
    });
  },

  async getDeckCounts(uid: string, deckId: DeckId): Promise<{ total: number; due: number; }>{
    const totalSnap = await getCountFromServer(cardsCol(uid, deckId));
    const dueQ = query(cardsCol(uid, deckId), where('srs.dueDate', '<=', Timestamp.now()));
    const dueSnap = await getCountFromServer(dueQ);
    return { total: totalSnap.data().count, due: dueSnap.data().count } as { total: number; due: number };
  },

  // Migration: set default difficulty for cards missing it
  async migrateDeckDifficulty(uid: string, deckId: DeckId, defaultDifficulty: number = 5) {
    const snap = await getDocs(cardsCol(uid, deckId));
    let batch = writeBatch(db);
    let ops = 0;
    for (const d of snap.docs) {
      const data = d.data() as any;
      if (typeof data.difficulty !== 'number') {
        batch.update(d.ref, { difficulty: defaultDifficulty, updatedAt: serverTimestamp() } as any);
        ops++;
        if (ops === 400) { await batch.commit(); batch = writeBatch(db); ops = 0; }
      }
    }
    if (ops > 0) await batch.commit();
  },

  async migrateAllDecksDifficulty(uid: string, defaultDifficulty: number = 5) {
    const decks = await getDocs(decksCol(uid));
    for (const d of decks.docs) {
      await this.migrateDeckDifficulty(uid, d.id as DeckId, defaultDifficulty);
    }
  },

  async moveCard(uid: string, fromDeck: DeckId, toDeck: DeckId, cardId: CardId) {
    if (fromDeck === toDeck) return;
    const srcRef = doc(db, `${userPath(uid)}/flashcards/${fromDeck}/cards/${cardId}`);
    const snap = await getDoc(srcRef);
    if (!snap.exists()) return;
    const data = snap.data();
    // create in target
    const newId = await this.addCard(uid, toDeck, { ...(data as any), deckId: toDeck } as any);
    // delete source
    await this.deleteCard(uid, fromDeck, cardId);
    return newId;
  },

  async duplicateCard(uid: string, deckId: DeckId, cardId: CardId) {
    const srcRef = doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${cardId}`);
    const snap = await getDoc(srcRef);
    if (!snap.exists()) return;
    const data = snap.data();
    return await this.addCard(uid, deckId, data as any);
  },

  // Duplicate a deck and all of its cards
  async duplicateDeck(uid: string, deckId: DeckId): Promise<DeckId | null> {
    const deckSnap = await getDoc(doc(db, `${userPath(uid)}/flashcards/${deckId}`));
    if (!deckSnap.exists()) return null;
    const srcDeck = deckSnap.data() as any;
    const newDeckId = await this.createDeck(uid, `${srcDeck.name} (Copy)`, srcDeck.description, srcDeck.tags);
    // copy all cards
    const srcCards = await getDocs(cardsCol(uid, deckId));
    for (const c of srcCards.docs) {
      const data = c.data();
      await this.addCard(uid, newDeckId as DeckId, { ...(data as any), deckId: newDeckId } as any);
    }
    return newDeckId as DeckId;
  },

  // Reorder cards by assigning sequential positions
  async reorderCards(uid: string, deckId: DeckId, orderedIds: CardId[]) {
    const batch = writeBatch(db);
    const base = 1000;
    orderedIds.forEach((id, idx) => {
      const pos = base + idx * 100;
      batch.update(doc(db, `${userPath(uid)}/flashcards/${deckId}/cards/${id}`), { position: pos, updatedAt: serverTimestamp() });
    });
    await batch.commit();
  },

  // --- Tags helpers ---
  buildTagIndexFromCards(cards: Flashcard[]): Record<string, number> {
    const map: Record<string, number> = {};
    for (const c of cards) {
      const tags = (c as any).tags as string[] | undefined;
      if (!tags) continue;
      for (const raw of tags) {
        const t = raw.trim().toLowerCase();
        if (!t) continue;
        map[t] = (map[t] || 0) + 1;
      }
    }
    return map;
  },

  async getDeckTagIndex(uid: string, deckId: DeckId): Promise<Record<string, number>> {
    const snap = await getDocs(cardsCol(uid, deckId));
    const cards: Flashcard[] = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as Flashcard));
    return this.buildTagIndexFromCards(cards);
  },

  filterCardsByTags(cards: Flashcard[], selected: string[]): Flashcard[] {
    if (!selected.length) return cards;
    const wanted = selected.map(s => s.toLowerCase());
    return cards.filter(c => {
      const tags = ((c as any).tags as string[] | undefined)?.map(t => t.toLowerCase()) || [];
      return wanted.every(w => tags.includes(w));
    });
  },

  // SRS scheduling with SM2-like algorithm
  schedule(next: { rating: CardRating; srs: SRSData; difficulty?: number }): SRSData {
    const { rating } = next;
    const difficulty = typeof next.difficulty === 'number' ? next.difficulty : 5;
    let { repetitions, easeFactor, interval } = next.srs;

    // Map rating to quality 0-5 similar to SM2
    const quality = rating === 'again' ? 1 : rating === 'hard' ? 2 : rating === 'good' ? 4 : 5;

    if (quality < 3) {
      repetitions = 0;
      interval = Math.max(1, Math.round(1 + (difficulty - 5) * 0.3)); // harder cards come back sooner
    } else {
      if (repetitions === 0) interval = 1;
      else if (repetitions === 1) interval = 6;
      else interval = Math.round(interval * easeFactor);
      repetitions += 1;
    }

    // EF update
  easeFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  // adjust EF slightly by difficulty (harder => smaller EF)
  easeFactor = easeFactor - (difficulty - 5) * 0.02;
    if (easeFactor < 1.3) easeFactor = 1.3;

    const dueDate = Timestamp.fromDate(new Date(Date.now() + interval * 24 * 60 * 60 * 1000));

    return {
      repetitions,
      easeFactor,
      interval,
      dueDate,
      lastReviewed: Timestamp.now(),
    } as SRSData;
  },

  async uploadImage(file: File, userId: string): Promise<string> {
    if (!file.type.startsWith('image/')) {
      throw new Error('File is not an image.');
    }

    const options = {
      maxSizeMB: 4.5,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };

    try {
  const compressedFile = await imageCompression(file, options);
  const storageRef = ref(storage, `users/${userId}/flashcards/images/${Date.now()}_${compressedFile.name}`);

  await uploadBytes(storageRef, compressedFile);

  const downloadUrl = await getDownloadURL(storageRef);

  return downloadUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      throw new Error('Image upload failed. Please try again.');
    }
  },
};
