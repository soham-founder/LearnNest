// Memory service: manage durable learner profiles, misconceptions, and streaks
// TODO: Encapsulate memory retrieval and updates
export interface MemoryItem { id?: string; kind: string; data: any; updatedAt?: number }

export async function getMemory(userId: string): Promise<MemoryItem[]> {
  // Implement Firestore-backed memory
  return [];
}
