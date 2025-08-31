// This script is for manually testing the AI quiz generation pipeline.
// It simulates a frontend client calling the `generateValidatedQuiz` Firebase Function.

// IMPORTANT: Before running, ensure you have:
// 1. Logged into Firebase: `firebase login`
// 2. Set up your project: `firebase use <your-project-id>`
// 3. Set the required environment variables for your AI services in the Firebase config:
//    `firebase functions:config:set openai.key="YOUR_OPENAI_KEY"`
//    `firebase functions:config:set gemini.key="YOUR_GEMINI_KEY"`
//    `firebase functions:config:set pinecone.key="YOUR_PINECONE_KEY"`
//    (Replace with your actual keys)

const admin = require('firebase-admin');
const functions = require('firebase-functions-test')();

// Initialize Firebase Admin SDK


// Import the function to be tested
const myFunctions = require('./functions/lib/index');
const generateValidatedQuiz = functions.wrap(myFunctions.generateValidatedQuiz);

async function runTest() {
  console.log('Starting quiz generation test...');

  // 1. Define the input data for the function
  const testData = {
    text: `
      The mitochondria is the powerhouse of the cell. It is responsible for generating most of the cell's supply of adenosine triphosphate (ATP), used as a source of chemical energy.
      The process of cellular respiration takes place in the mitochondria. This process uses oxygen and glucose to produce ATP, water, and carbon dioxide.
      Mitochondria have their own small chromosomes and can replicate independently of the cell cycle.
      They are composed of two membranes: an outer membrane and a highly folded inner membrane, where the electron transport chain is located.
    `,
    userId: 'test-user-123',
    numberOfQuestions: 5,
    difficulty: 'medium',
    questionTypes: ['multiple-choice', 'true-false', 'short-answer'],
    languageCode: 'en',
    contentSource: 'paste',
  };

  // 2. Create a context object for the function call
  const context = {
    auth: {
      uid: 'test-user-123',
      token: 'test-token',
    },
  };

  try {
    // 3. Call the function with the test data and context
    console.log('Invoking generateValidatedQuiz function...');
    const result = await generateValidatedQuiz(testData, context);

    // 4. Log the results
    console.log('--- QUIZ GENERATION COMPLETE ---');
    console.log('Generated Quiz Title:', result.title);
    console.log('Number of Questions:', result.questionCount);
    console.log('\n--- VALIDATION REPORT ---');
    console.log(JSON.stringify(result.validationReport, null, 2));
    console.log('\n--- GENERATED QUESTIONS ---');
    console.log(JSON.stringify(result.questions, null, 2));
    console.log('\n--- RAG SOURCES ---');
    console.log(JSON.stringify(result.retrievedSources, null, 2));

    if (result.questionCount < testData.numberOfQuestions) {
      console.warn(`\nWarning: The pipeline filtered out ${testData.numberOfQuestions - result.questionCount} questions.`);
    }

  } catch (error) {
    console.error('--- TEST FAILED ---');
    console.error('Error calling generateValidatedQuiz:', error);
  } finally {
    // 5. Clean up
    functions.cleanup();
    process.exit(0);
  }
}

runTest();
