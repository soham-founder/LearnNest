"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
exports.highlights = exports.generateQuiz = exports.generateFlashcards = exports.explainNote = exports.summarizeNote = void 0;
var functions = require("firebase-functions");
var admin = require("firebase-admin");
var generative_ai_1 = require("@google/generative-ai");
var cors = require("cors");
// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
// Initialize CORS with options
var corsHandler = cors({ origin: true });
// Initialize Gemini AI
var getGeminiAPI = function () {
    var _a, _b;
    var apiKey = process.env.GEMINI_API_KEY || ((_b = (_a = functions.config()) === null || _a === void 0 ? void 0 : _a.gemini) === null || _b === void 0 ? void 0 : _b.key);
    if (!apiKey) {
        throw new Error('Gemini API key not configured');
    }
    return new generative_ai_1.GoogleGenerativeAI(apiKey);
};
// Utility functions
var validateAuth = function (idToken) { return __awaiter(void 0, void 0, void 0, function () {
    var decodedToken, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                return [4 /*yield*/, admin.auth().verifyIdToken(idToken)];
            case 1:
                decodedToken = _a.sent();
                return [2 /*return*/, decodedToken.uid];
            case 2:
                error_1 = _a.sent();
                throw new Error('Invalid authentication token');
            case 3: return [2 /*return*/];
        }
    });
}); };
var validateInput = function (data) {
    if (!data.noteId || !data.contentMarkdown || !data.subject) {
        throw new Error('Missing required fields: noteId, contentMarkdown, subject');
    }
    if (typeof data.contentMarkdown !== 'string' || data.contentMarkdown.trim().length === 0) {
        throw new Error('contentMarkdown must be a non-empty string');
    }
    return {
        noteId: data.noteId,
        contentMarkdown: data.contentMarkdown,
        subject: data.subject,
        tags: Array.isArray(data.tags) ? data.tags : [],
        mode: data.mode || 'rigorous',
        returnEmbedding: data.returnEmbedding || false
    };
};
var chunkContent = function (content, maxSize) {
    if (maxSize === void 0) { maxSize = 45000; }
    if (content.length <= maxSize) {
        return content;
    }
    // For large content, take the first chunk and summarize it
    return content.substring(0, maxSize) + '\\n\\n[Content truncated for processing...]';
};
var generateEmbedding = function (text) { return __awaiter(void 0, void 0, void 0, function () {
    var genAI, model, result, error_2;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 2, , 3]);
                genAI = getGeminiAPI();
                model = genAI.getGenerativeModel({ model: 'embedding-001' });
                return [4 /*yield*/, model.embedContent(text)];
            case 1:
                result = _a.sent();
                return [2 /*return*/, result.embedding.values];
            case 2:
                error_2 = _a.sent();
                console.error('Error generating embedding:', error_2);
                throw new Error('Failed to generate embedding');
            case 3: return [2 /*return*/];
        }
    });
}); };
// AI Endpoint: Summarize Note
exports.summarizeNote = functions.https.onRequest(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, corsHandler(req, res, function () { return __awaiter(void 0, void 0, void 0, function () {
                var authHeader, idToken, input, content, genAI, model, prompt_1, result, summary, response, _a, error_3;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 5, , 6]);
                            if (req.method !== 'POST') {
                                return [2 /*return*/, res.status(405).json({ error: 'Method not allowed' })];
                            }
                            authHeader = req.headers.authorization;
                            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                                return [2 /*return*/, res.status(401).json({ error: 'Missing or invalid authorization header' })];
                            }
                            idToken = authHeader.split('Bearer ')[1];
                            return [4 /*yield*/, validateAuth(idToken)];
                        case 1:
                            _b.sent();
                            input = validateInput(req.body);
                            content = chunkContent(input.contentMarkdown);
                            genAI = getGeminiAPI();
                            model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                            prompt_1 = "Please provide a concise but comprehensive summary of the following ".concat(input.subject, " note. \n      Focus on the key concepts, main ideas, and important details. The summary should be informative yet accessible.\n      \n      Subject: ").concat(input.subject, "\n      Tags: ").concat(input.tags.join(', '), "\n      \n      Content:\n      ").concat(content, "\n      \n      Summary:");
                            return [4 /*yield*/, model.generateContent(prompt_1)];
                        case 2:
                            result = _b.sent();
                            summary = result.response.text().trim();
                            response = { summary: summary };
                            if (!input.returnEmbedding) return [3 /*break*/, 4];
                            _a = response;
                            return [4 /*yield*/, generateEmbedding(content)];
                        case 3:
                            _a.embedding = _b.sent();
                            _b.label = 4;
                        case 4: return [2 /*return*/, res.status(200).json(response)];
                        case 5:
                            error_3 = _b.sent();
                            console.error('Error in summarizeNote:', error_3);
                            return [2 /*return*/, res.status(500).json({
                                    error: error_3 instanceof Error ? error_3.message : 'Internal server error'
                                })];
                        case 6: return [2 /*return*/];
                    }
                });
            }); })];
    });
}); });
// AI Endpoint: Explain Note
exports.explainNote = functions.https.onRequest(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, corsHandler(req, res, function () { return __awaiter(void 0, void 0, void 0, function () {
                var authHeader, idToken, input, content, genAI, model, modeInstructions, prompt_2, result, explanation, response, _a, error_4;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 5, , 6]);
                            if (req.method !== 'POST') {
                                return [2 /*return*/, res.status(405).json({ error: 'Method not allowed' })];
                            }
                            authHeader = req.headers.authorization;
                            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                                return [2 /*return*/, res.status(401).json({ error: 'Missing or invalid authorization header' })];
                            }
                            idToken = authHeader.split('Bearer ')[1];
                            return [4 /*yield*/, validateAuth(idToken)];
                        case 1:
                            _b.sent();
                            input = validateInput(req.body);
                            content = chunkContent(input.contentMarkdown);
                            genAI = getGeminiAPI();
                            model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                            modeInstructions = input.mode === 'eli5'
                                ? 'Explain this as if I am 5 years old. Use simple language, analogies, and examples that a young child would understand.'
                                : 'Provide a detailed, rigorous explanation with technical depth, examples, and comprehensive analysis suitable for advanced learners.';
                            prompt_2 = "".concat(modeInstructions, "\n      \n      Please explain the following ").concat(input.subject, " content:\n      \n      Subject: ").concat(input.subject, "\n      Tags: ").concat(input.tags.join(', '), "\n      \n      Content:\n      ").concat(content, "\n      \n      Explanation:");
                            return [4 /*yield*/, model.generateContent(prompt_2)];
                        case 2:
                            result = _b.sent();
                            explanation = result.response.text().trim();
                            response = { explanation: explanation };
                            if (!input.returnEmbedding) return [3 /*break*/, 4];
                            _a = response;
                            return [4 /*yield*/, generateEmbedding(content)];
                        case 3:
                            _a.embedding = _b.sent();
                            _b.label = 4;
                        case 4: return [2 /*return*/, res.status(200).json(response)];
                        case 5:
                            error_4 = _b.sent();
                            console.error('Error in explainNote:', error_4);
                            return [2 /*return*/, res.status(500).json({
                                    error: error_4 instanceof Error ? error_4.message : 'Internal server error'
                                })];
                        case 6: return [2 /*return*/];
                    }
                });
            }); })];
    });
}); });
// AI Endpoint: Generate Flashcards
exports.generateFlashcards = functions.https.onRequest(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, corsHandler(req, res, function () { return __awaiter(void 0, void 0, void 0, function () {
                var authHeader, idToken, input, content, genAI, model, prompt_3, result, cardsText, cards, response, _a, error_5;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 5, , 6]);
                            if (req.method !== 'POST') {
                                return [2 /*return*/, res.status(405).json({ error: 'Method not allowed' })];
                            }
                            authHeader = req.headers.authorization;
                            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                                return [2 /*return*/, res.status(401).json({ error: 'Missing or invalid authorization header' })];
                            }
                            idToken = authHeader.split('Bearer ')[1];
                            return [4 /*yield*/, validateAuth(idToken)];
                        case 1:
                            _b.sent();
                            input = validateInput(req.body);
                            content = chunkContent(input.contentMarkdown);
                            genAI = getGeminiAPI();
                            model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                            prompt_3 = "Create flashcards from the following ".concat(input.subject, " content. \n      Generate 5-10 high-quality flashcards that cover the most important concepts.\n      \n      Format your response as a JSON array with this exact structure:\n      [\n        {\n          \"front\": \"Question or concept\",\n          \"back\": \"Answer or explanation\",\n          \"hint\": \"Optional hint (can be omitted)\"\n        }\n      ]\n      \n      Subject: ").concat(input.subject, "\n      Tags: ").concat(input.tags.join(', '), "\n      \n      Content:\n      ").concat(content, "\n      \n      JSON:");
                            return [4 /*yield*/, model.generateContent(prompt_3)];
                        case 2:
                            result = _b.sent();
                            cardsText = result.response.text().trim();
                            // Clean up the response to extract JSON
                            cardsText = cardsText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
                            cards = void 0;
                            try {
                                cards = JSON.parse(cardsText);
                            }
                            catch (parseError) {
                                // Fallback: create cards from text response
                                cards = [
                                    {
                                        front: 'Key Concept',
                                        back: cardsText.substring(0, 200) + '...',
                                        hint: 'Generated from AI response'
                                    }
                                ];
                            }
                            response = { cards: cards };
                            if (!input.returnEmbedding) return [3 /*break*/, 4];
                            _a = response;
                            return [4 /*yield*/, generateEmbedding(content)];
                        case 3:
                            _a.embedding = _b.sent();
                            _b.label = 4;
                        case 4: return [2 /*return*/, res.status(200).json(response)];
                        case 5:
                            error_5 = _b.sent();
                            console.error('Error in generateFlashcards:', error_5);
                            return [2 /*return*/, res.status(500).json({
                                    error: error_5 instanceof Error ? error_5.message : 'Internal server error'
                                })];
                        case 6: return [2 /*return*/];
                    }
                });
            }); })];
    });
}); });
// AI Endpoint: Generate Quiz
exports.generateQuiz = functions.https.onRequest(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, corsHandler(req, res, function () { return __awaiter(void 0, void 0, void 0, function () {
                var authHeader, idToken, input, content, genAI, model, prompt_4, result, quizText, quiz, response, _a, error_6;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 5, , 6]);
                            if (req.method !== 'POST') {
                                return [2 /*return*/, res.status(405).json({ error: 'Method not allowed' })];
                            }
                            authHeader = req.headers.authorization;
                            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                                return [2 /*return*/, res.status(401).json({ error: 'Missing or invalid authorization header' })];
                            }
                            idToken = authHeader.split('Bearer ')[1];
                            return [4 /*yield*/, validateAuth(idToken)];
                        case 1:
                            _b.sent();
                            input = validateInput(req.body);
                            content = chunkContent(input.contentMarkdown);
                            genAI = getGeminiAPI();
                            model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                            prompt_4 = "Create a quiz from the following ".concat(input.subject, " content.\n      Generate 5-8 questions of mixed types (multiple choice, true/false, short answer).\n      \n      Format your response as a JSON object with this exact structure:\n      {\n        \"title\": \"Quiz title\",\n        \"subject\": \"").concat(input.subject, "\",\n        \"difficulty\": \"medium\",\n        \"questions\": [\n          {\n            \"type\": \"mcq\",\n            \"prompt\": \"Question text?\",\n            \"options\": [\"A\", \"B\", \"C\", \"D\"],\n            \"answer\": \"A\"\n          },\n          {\n            \"type\": \"tf\",\n            \"prompt\": \"True or false statement?\",\n            \"answer\": \"true\"\n          },\n          {\n            \"type\": \"short\",\n            \"prompt\": \"Short answer question?\",\n            \"answer\": \"Expected answer\"\n          }\n        ]\n      }\n      \n      Subject: ").concat(input.subject, "\n      Tags: ").concat(input.tags.join(', '), "\n      \n      Content:\n      ").concat(content, "\n      \n      JSON:");
                            return [4 /*yield*/, model.generateContent(prompt_4)];
                        case 2:
                            result = _b.sent();
                            quizText = result.response.text().trim();
                            // Clean up the response to extract JSON
                            quizText = quizText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
                            quiz = void 0;
                            try {
                                quiz = JSON.parse(quizText);
                            }
                            catch (parseError) {
                                // Fallback: create a basic quiz
                                quiz = {
                                    title: "".concat(input.subject, " Quiz"),
                                    subject: input.subject,
                                    difficulty: 'medium',
                                    questions: [
                                        {
                                            type: 'short',
                                            prompt: 'What are the main concepts covered in this note?',
                                            answer: 'Key concepts from the provided content'
                                        }
                                    ]
                                };
                            }
                            response = { quiz: quiz };
                            if (!input.returnEmbedding) return [3 /*break*/, 4];
                            _a = response;
                            return [4 /*yield*/, generateEmbedding(content)];
                        case 3:
                            _a.embedding = _b.sent();
                            _b.label = 4;
                        case 4: return [2 /*return*/, res.status(200).json(response)];
                        case 5:
                            error_6 = _b.sent();
                            console.error('Error in generateQuiz:', error_6);
                            return [2 /*return*/, res.status(500).json({
                                    error: error_6 instanceof Error ? error_6.message : 'Internal server error'
                                })];
                        case 6: return [2 /*return*/];
                    }
                });
            }); })];
    });
}); });
// AI Endpoint: Generate Highlights
exports.highlights = functions.https.onRequest(function (req, res) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        return [2 /*return*/, corsHandler(req, res, function () { return __awaiter(void 0, void 0, void 0, function () {
                var authHeader, idToken, input, content, genAI, model, prompt_5, result, bulletsText, bullets, lines, response, _a, error_7;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            _b.trys.push([0, 5, , 6]);
                            if (req.method !== 'POST') {
                                return [2 /*return*/, res.status(405).json({ error: 'Method not allowed' })];
                            }
                            authHeader = req.headers.authorization;
                            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                                return [2 /*return*/, res.status(401).json({ error: 'Missing or invalid authorization header' })];
                            }
                            idToken = authHeader.split('Bearer ')[1];
                            return [4 /*yield*/, validateAuth(idToken)];
                        case 1:
                            _b.sent();
                            input = validateInput(req.body);
                            content = chunkContent(input.contentMarkdown);
                            genAI = getGeminiAPI();
                            model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
                            prompt_5 = "Identify the most important points and key highlights from the following ".concat(input.subject, " content.\n      Extract 5-10 bullet points that represent the most crucial information.\n      \n      Format your response as a JSON array of strings:\n      [\n        \"First key highlight\",\n        \"Second important point\",\n        \"Third crucial concept\"\n      ]\n      \n      Subject: ").concat(input.subject, "\n      Tags: ").concat(input.tags.join(', '), "\n      \n      Content:\n      ").concat(content, "\n      \n      JSON:");
                            return [4 /*yield*/, model.generateContent(prompt_5)];
                        case 2:
                            result = _b.sent();
                            bulletsText = result.response.text().trim();
                            // Clean up the response to extract JSON
                            bulletsText = bulletsText.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim();
                            bullets = void 0;
                            try {
                                bullets = JSON.parse(bulletsText);
                            }
                            catch (parseError) {
                                lines = bulletsText.split('\\n').filter(function (line) { return line.trim().length > 0; });
                                bullets = lines.slice(0, 10).map(function (line) { return line.replace(/^[-•*]\s*/, '').trim(); });
                            }
                            response = { bullets: bullets };
                            if (!input.returnEmbedding) return [3 /*break*/, 4];
                            _a = response;
                            return [4 /*yield*/, generateEmbedding(content)];
                        case 3:
                            _a.embedding = _b.sent();
                            _b.label = 4;
                        case 4: return [2 /*return*/, res.status(200).json(response)];
                        case 5:
                            error_7 = _b.sent();
                            console.error('Error in highlights:', error_7);
                            return [2 /*return*/, res.status(500).json({
                                    error: error_7 instanceof Error ? error_7.message : 'Internal server error'
                                })];
                        case 6: return [2 /*return*/];
                    }
                });
            }); })];
    });
}); });
