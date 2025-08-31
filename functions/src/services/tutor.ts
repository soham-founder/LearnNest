// Tutor service: Socratic dialogue + orchestration
// TODO: Implement prompt composition, reasoning steps, and tool calling hooks
export async function socraticReply(args: { userId: string; message: string; context?: string }) {
  // TODO: integrate RAG + safety + memory updating
  return {
    reply: 'What is the problem asking you to find? Let’s identify the first step together.',
    steps: ['Restate problem', 'List knowns/unknowns', 'Attempt first step'],
  };
}
