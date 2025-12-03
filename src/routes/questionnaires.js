import express from 'express';
import { authenticateToken, requireRole } from '../middleware/auth.js';
// ⚠️ ASSUMPTION: This import works and provides a pool/connection object supporting transactions
import db from '../config/database.js'; // Assuming this provides the database connection pool

const router = express.Router();

/**
 * Executes a database transaction to save the questionnaire, its questions, and its options.
 * @param {object} questionnaireData - The data for the form (title, description, purpose, questions array).
 * @param {number} userId - The ID of the employee creating the questionnaire.
 * @returns {Promise<number>} The ID of the newly created questionnaire.
 */
async function createQuestionnaireInDB(questionnaireData, userId) {
  let connection;
  try {
    // 1. Get a connection from the pool and start a transaction
    connection = await db.getConnection();
    await connection.beginTransaction();

    // 2. Insert into 'questionnaires' table
    const [qResult] = await connection.execute(
      'INSERT INTO questionnaires (title, description, created_by, purpose) VALUES (?, ?, ?, ?)',
      [questionnaireData.title, questionnaireData.description, userId, questionnaireData.purpose]
    );
    const questionnaireId = qResult.insertId;

    // 3. Insert questions with options stored as JSON
    for (const question of questionnaireData.questions) {
      // Prepare options as JSON (or null if no options)
      const optionsJson = question.options && question.options.length > 0
        ? JSON.stringify(question.options)
        : null;

      // Insert into 'questionnaire_questions' with options as JSON
      await connection.execute(
        'INSERT INTO questionnaire_questions (questionnaire_id, question_text, question_type, options) VALUES (?, ?, ?, ?)',
        [questionnaireId, question.text, question.type, optionsJson]
      );
    }

    // 5. Commit transaction
    await connection.commit();

    return questionnaireId;

  } catch (error) {
    // 6. Rollback transaction on error
    if (connection) {
      await connection.rollback();
    }
    console.error("DB Transaction Failed:", error);
    // Rethrow the error to be caught by the route handler
    throw new Error('Database transaction failed during questionnaire creation.');
  } finally {
    // 7. Release the connection back to the pool
    if (connection) {
      connection.release();
    }
  }
}


// --- ACTUAL ROUTE IMPLEMENTATION ---

// GET /api/questionnaires/overview
router.get('/overview', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ module: 'questionnaires', status: 'ok' });
});

// GET /api/questionnaires/forms
router.get('/forms', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  // ⚠️ IMPLEMENTATION: Fetch the list of forms from the database
  res.json({ items: [] });
});


/**
 * POST /api/questionnaires/forms - Create a New Questionnaire
 * Requires admin/manager role.
 */
router.post('/forms', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  // Check if req.user exists and has a primary identifier
  const userId = req.user?.id || req.user?.employeeId; // Adjust based on your auth middleware
  if (!userId) {
    // If authentication passed but user ID is missing (unlikely, but good to guard)
    return res.status(401).json({ message: "Authentication failed: User ID not found." });
  }

  try {
    const newQuestionnaireId = await createQuestionnaireInDB(req.body, userId);

    res.status(201).json({
      id: newQuestionnaireId,
      message: 'Questionnaire created successfully.'
    });

  } catch (error) {
    // If the transaction failed, send a 500 status with the specific error message
    res.status(500).json({ message: error.message || 'Failed to create questionnaire due to a database error.' });
  }
});


// Existing endpoints (placeholders for other functionality)
router.get('/responses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ items: [] });
});

router.post('/assign', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.status(201).json({ id: null, scheduled: false });
});

router.get('/forms/:id/responses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ items: [] });
});

router.get('/forms/:id/export', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ url: null, format: req.query.format || 'csv' });
});

export default router;