// RAG service: abstract retrieval across Pinecone/Firestore Vector/etc.
// TODO: Implement vectorization, upsert, and query using configured provider
export interface RetrievedChunk { id: string; text: string; score?: number; source?: string }

export async function retrieveContext(query: string, topK = 5): Promise<RetrievedChunk[]> {
  // Placeholder; return empty to indicate no retrieval
  return [];
}
