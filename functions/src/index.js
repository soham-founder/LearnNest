"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
exports.__esModule = true;
exports.highlights = exports.generateQuiz = exports.generateFlashcards = exports.explainNote = exports.summarizeNote = void 0;
var admin = require("firebase-admin");
// Initialize Firebase Admin
admin.initializeApp();
// Export AI functions
var ai_1 = require("./ai");
__createBinding(exports, ai_1, "summarizeNote");
__createBinding(exports, ai_1, "explainNote");
__createBinding(exports, ai_1, "generateFlashcards");
__createBinding(exports, ai_1, "generateQuiz");
__createBinding(exports, ai_1, "highlights");
