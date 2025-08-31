# 📘 LearnNest

**LearnNest – AI + Productivity for Students**  
An intelligent learning and wellness platform that merges **adaptive tutoring**, **productivity tools**, **spaced repetition flashcards**, **peer learning**, and **mental health support** — all in one ecosystem.  


Key features:
- Generate validated quizzes from pasted text, your notes, or PDFs/DOCX (PDF built-in, DOCX optional)
- Chunking for large inputs, multilingual output, accessibility phrasing
- RAG optional (Pinecone), Gemini validation, hints, and personalized feedback

### Prerequisites
- Node 18+
- Firebase CLI (logged in and set to the right project)
- Firebase project upgraded to Blaze plan for Cloud Functions deploy (Cloud Build/Artifact Registry)

### Frontend dev
```bash
npm install
npm run dev
```

### Functions dev and deploy
Set required runtime config:
```bash
cd functions
npm install
# Required
firebase functions:config:set openai.key="YOUR_OPENAI_KEY" gemini.key="YOUR_GEMINI_KEY"
# Optional RAG
firebase functions:config:set pinecone.key="YOUR_PINECONE_KEY"
```

Local build/emulate:
```bash
cd functions
npm run build
firebase emulators:start --only functions
```

Deploy (requires Blaze plan):
```bash
cd functions
npm run deploy
```

### Notes
- DOCX parsing via `mammoth` is optional. To enable:
```bash
cd functions && npm i mammoth
```
- If Pinecone isn’t configured, RAG is skipped gracefully.
=======
# LearnNest
LearnNest – AI + Productivity for Students. An intelligent learning and wellness platform that merges adaptive tutoring, focus/productivity tools (Pomodoro, task management, habit tracking), spaced repetition flashcards, peer learning, and mental health support — all in one ecosystem.
>>>>>>> 2c4bc704ee66631205ee0a9b9070248057c1e2d3
