import { askGemini } from '../services/geminiClient';
import type { Quiz, Question, QuestionType } from '../types/quiz';
import { Timestamp } from 'firebase/firestore';

interface QuizGenerationOptions {
  numberOfQuestions?: number;
  difficulty?: 'easy' | 'medium' | 'hard';
  questionTypes?: QuestionType[];
}

/**
 * Generates a quiz from provided text content using the Gemini AI.
 * @param noteContent The text content of the note to generate questions from.
 * @param userId The ID of the user generating the quiz.
 * @param options Quiz generation options (number of questions, difficulty, types).
 * @returns A Promise that resolves to a Quiz object.
 */
export const generateQuizFromNotes = async (
  noteContent: string,
  userId: string,
  options: QuizGenerationOptions = {}
): Promise<Quiz> => {
  const { numberOfQuestions = 5, difficulty = 'medium', questionTypes = ['multiple-choice', 'true-false'] } = options;

  let prompt = `As an AI-powered quiz generator for a study app, your task is to analyze the provided study note content, identify key concepts, facts, and relationships, and then generate a comprehensive quiz.`;
  prompt += `\n\nHere are the quiz specifications:`;
  prompt += `\n- **Difficulty**: ${difficulty} (Adjust the complexity of questions and distractors based on this level).`;
  prompt += `\n- **Number of Questions**: ${numberOfQuestions}.`;
  prompt += `\n- **Question Types**: ${questionTypes.map(type => type.replace('-', ' ')).join(', ')}. Focus on these types proportionally.`;
  prompt += `\n  - For 'multiple-choice' questions, ensure there are 4 distinct options (A, B, C, D) and generate plausible distractors.`;
  prompt += `\n  - For 'fill-in-the-blank', indicate the blank with '_____' and provide the exact word(s) for the blank in the correct answer. If multiple blanks, comma-separate answers.`;
  prompt += `\n- **Answers and Explanations**: Provide a precise correct answer and a concise explanation for why it's correct for *every* question.`;

  prompt += `\n\nNote Content for Analysis:\n"""\n${noteContent}\n"""\n`;

  prompt += `Provide the quiz as a strict JSON array of question objects. Ensure each question object has the following exact structure and valid data types:`;
  prompt += `\n\`\`\`json\n[\n  {\n    "id": "unique-string-id-1",\n    "type": "multiple-choice",\n    "questionText": "What is the main function of React's useState hook?",\n    "options": ["To perform side effects", "To manage state in functional components", "To optimize component rendering", "To handle routing"],\n    "correctAnswer": "To manage state in functional components",\n    "explanation": "The useState hook allows functional components to have state variables."\n  },\n  {\n    "id": "unique-string-id-2",\n    "type": "true-false",\n    "questionText": "Firebase Firestore is a NoSQL, document-oriented database.",
    "correctAnswer": "True",
    "explanation": "Firestore stores data in documents and collections, making it a NoSQL, document-oriented database."
  },
  {\n    "id": "unique-string-id-3",\n    "type": "fill-in-the-blank",\n    "questionText": "The JavaScript keyword \"____\" is used to declare a constant variable.",
    "correctAnswer": "const",
    "explanation": "The 'const' keyword declares a block-scoped local variable whose value cannot be reassigned."
  },
  {\n    "id": "unique-string-id-4",\n    "type": "short-answer",\n    "questionText": "Briefly explain the purpose of the useEffect hook in React.",
    "correctAnswer": "The useEffect hook allows you to perform side effects in functional components, such as data fetching, subscriptions, or manually changing the DOM.",
    "explanation": "useEffect is crucial for synchronizing a component with an external system."
  }
]\`\`\`\n`;
  prompt += `Ensure the output is ONLY the JSON array, with no leading/trailing text or markdown outside the JSON block. Do not include any comments in the JSON.`;

  // Note on Content Chunking: For very large notes, this direct approach might hit API token limits. 
  // A more advanced implementation would involve summarizing or chunking the noteContent before sending to the AI, 
  // or generating questions from specific sections. For now, we assume a reasonable note size.

  try {
    const aiResponse = await askGemini(prompt);
    let jsonString = aiResponse.trim();
    // Robustly extract JSON from potential markdown code blocks
    if (jsonString.startsWith('```json')) {
        jsonString = jsonString.substring(7, jsonString.length - 3).trim();
    } else if (jsonString.startsWith('```')) { // Fallback for generic code blocks
        jsonString = jsonString.substring(3, jsonString.length - 3).trim();
    }

    const questions: Question[] = JSON.parse(jsonString);

    // Assign client-side unique IDs if AI didn't provide them (though prompt asks for it)
    questions.forEach((q, index) => {
        if (!q.id) {
            q.id = `q-${Date.now()}-${index}`;
        }
    });

    const quizTitle = `AI Generated Quiz: ${noteContent.substring(0, 40).replace(/\n/g, ' ')}...`; // Generate a dynamic title

    const newQuiz: Quiz = {
      id: 'temporary-id', // Will be replaced with Firestore document ID when saved
      userId,
      title: quizTitle,
      difficulty,
      questionCount: questions.length,
      questions,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    };

    return newQuiz;
  } catch (error) {
    console.error("Error generating quiz from AI: ", error);
    throw new Error(`Failed to generate quiz: ${(error as Error).message || "Unknown error"}. Please ensure your note content is clear and try again.`);
  }
};
