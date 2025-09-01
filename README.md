# 📘 LearnNest
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-18+-blue)](https://nodejs.org/)


**AI + Productivity for Students**  
An intelligent learning and wellness platform that merges **adaptive tutoring**, **productivity tools**, **spaced repetition flashcards**, **peer learning**, and **mental health support** — all in one ecosystem.  
## 📑 Table of Contents
1. [Key Features](#-key-features)
2. [Prerequisites](#-prerequisites)
3. [Setup Instructions](#-setup-instructions)
4. [Optional Features](#-optional-features)
5. [Roadmap](#-roadmap)
6. [Contribution](#-contribution)
7. [Notes](#-notes)


## 🌟 Key Features:
- Generate validated quizzes from pasted text, your notes, or PDFs/DOCX (PDF built-in, DOCX optional)
- Chunking for large inputs, multilingual output, accessibility phrasing
- RAG optional (Pinecone), Gemini validation, hints, and personalized feedback

## 🛠️ Prerequisites:
- Node 18+
- Firebase CLI (logged in and set to the right project)
- Firebase project upgraded to Blaze plan for Cloud Functions deploy (Cloud Build/Artifact Registry)


## ⚡ Setup Instructions
Set required runtime config:

```bash
npm install
npm run dev
```

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

## 📄 Contribution
- Fork the repository
- Create a branch for your feature
- Submit a Pull Request
- Follow proper formatting and test features before submission


## 📝 Notes
- DOCX parsing via `mammoth` is optional. To enable:
```bash
cd functions && npm i mammoth
```
- If Pinecone isn’t configured, RAG is skipped gracefully.

### 6️⃣ Format **Roadmap** as a table
```markdown
## 🚀 Roadmap

- [x] MVP: AI Quiz Generator
- [ ] Phase 2: Spaced Repetition Flashcards
- [ ] Phase 3: Productivity Tools (Tasks, Pomodoro, Habit Tracker)
- [ ] Phase 4: Peer Learning & Study Groups
- [ ] Phase 5: Wellness Tracking
- [ ] Phase 6: Institutional Dashboards
- [ ] Final Phase: StudentOS Launcher


```

 


