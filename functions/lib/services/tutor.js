"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.socraticReply = void 0;
// Tutor service: Socratic dialogue + orchestration
// TODO: Implement prompt composition, reasoning steps, and tool calling hooks
async function socraticReply(args) {
    // TODO: integrate RAG + safety + memory updating
    return {
        reply: 'What is the problem asking you to find? Let’s identify the first step together.',
        steps: ['Restate problem', 'List knowns/unknowns', 'Attempt first step'],
    };
}
exports.socraticReply = socraticReply;
//# sourceMappingURL=tutor.js.map