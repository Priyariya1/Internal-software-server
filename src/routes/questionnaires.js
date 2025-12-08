import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireRole } from '../middleware/auth.js';
import db from '../config/database.js'; // Assuming this provides the database connection pool
import { google } from 'googleapis';
import { FormResponse } from '../models/FormResponse.js';
import { SheetsService } from '../services/sheets.js';

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
    const questionnaireId = uuidv4();
    await connection.execute(
      'INSERT INTO questionnaires (id, title, description, created_by, purpose) VALUES (?, ?, ?, ?, ?)',
      [questionnaireId, questionnaireData.title, questionnaireData.description, userId, questionnaireData.purpose]
    );

    // 3. Insert questions with options stored as JSON
    for (const [index, question] of questionnaireData.questions.entries()) {
      const questionId = uuidv4();
      // Prepare options as JSON (or null if no options)
      const optionsJson = question.options && question.options.length > 0
        ? JSON.stringify(question.options)
        : null;

      // Insert into 'questionnaire_questions' with options as JSON
      await connection.execute(
        'INSERT INTO questionnaire_questions (id, questionnaire_id, question_text, question_type, options, order_index) VALUES (?, ?, ?, ?, ?, ?)',
        [questionId, questionnaireId, question.text, question.type, optionsJson, index]
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
    throw new Error(`Database transaction failed: ${error.message}`);
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
  try {
    const [rows] = await db.execute(
      'SELECT id, title, description, purpose, created_at, google_form_id, google_form_url FROM questionnaires ORDER BY created_at DESC'
    );
    res.json({ items: rows });
  } catch (error) {
    console.error('Failed to fetch questionnaires:', error);
    res.status(500).json({ message: 'Failed to fetch questionnaires.' });
  }
});

// GET /api/questionnaires/:id/questions - Get questions for a questionnaire
router.get('/:id/questions', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;

  try {
    const [questions] = await db.execute(
      'SELECT id, question_text, question_type, options, order_index FROM questionnaire_questions WHERE questionnaire_id = ? ORDER BY order_index ASC',
      [questionnaireId]
    );

    res.json({ questions });
  } catch (error) {
    console.error('Failed to fetch questions:', error);
    res.status(500).json({ message: 'Failed to fetch questions.' });
  }
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

// POST /api/questionnaires/:id/convert - Convert to Google Form
router.post('/:id/convert', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;
  const userId = req.user.id;

  console.log('=== Convert to Google Form ===');
  console.log('Questionnaire ID:', questionnaireId);
  console.log('User ID:', userId);

  try {
    // 1. Check for Google Token
    const [tokens] = await db.execute(
      'SELECT access_token, refresh_token, expiry_date FROM oauth_tokens WHERE user_id = ?',
      [userId]
    );

    if (tokens.length === 0) {
      // No token found, user needs to authenticate
      // Generate the Google Auth URL directly here
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      const scopes = [
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/drive.file'
      ];

      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: userId
      });

      return res.status(401).json({
        message: 'Google authentication required',
        authUrl: url
      });
    }

    const tokenData = tokens[0];
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date
    });

    // 2. Fetch Questionnaire Data
    const [questionnaireRows] = await db.execute(
      'SELECT * FROM questionnaires WHERE id = ?',
      [questionnaireId]
    );
    if (questionnaireRows.length === 0) {
      return res.status(404).json({ message: 'Questionnaire not found' });
    }
    const questionnaire = questionnaireRows[0];

    const [questions] = await db.execute(
      'SELECT * FROM questionnaire_questions WHERE questionnaire_id = ? ORDER BY order_index ASC',
      [questionnaireId]
    );

    // 3. Create Google Form (only title allowed on creation)
    const forms = google.forms({ version: 'v1', auth: oauth2Client });

    const createResponse = await forms.forms.create({
      requestBody: {
        info: {
          title: questionnaire.title
        }
      }
    });

    const formId = createResponse.data.formId;
    const formUrl = createResponse.data.responderUri;

    // 4. Build batch update requests for description and questions
    const requests = [];

    // Add description if present
    if (questionnaire.description) {
      requests.push({
        updateFormInfo: {
          info: {
            description: questionnaire.description
          },
          updateMask: 'description'
        }
      });
    }
    // Add questions
    for (const q of questions) {
      const item = {
        createItem: {
          item: {
            title: q.question_text,
            questionItem: {
              question: {
                required: true // Assuming all are required for now, or fetch from DB if column exists
              }
            }
          },
          location: { index: q.order_index }
        }
      };

      // Map types
      if (q.question_type === 'short_text') {
        item.createItem.item.questionItem.question.textQuestion = {};
      } else if (q.question_type === 'long_text') {
        item.createItem.item.questionItem.question.textQuestion = { paragraph: true };
      } else if (['multiple_choice', 'checkbox', 'dropdown'].includes(q.question_type)) {
        let options = [];
        if (q.options) {
          if (Array.isArray(q.options)) {
            options = q.options;
          } else if (typeof q.options === 'string') {
            try {
              // Try to parse as JSON first
              options = JSON.parse(q.options);
            } catch (e) {
              // If not JSON, treat as comma-separated string
              options = q.options.split(',').map(opt => opt.trim()).filter(opt => opt.length > 0);
            }
          }
        }
        const choiceOptions = options.map(opt => ({ value: opt }));

        item.createItem.item.questionItem.question.choiceQuestion = {
          type: q.question_type === 'checkbox' ? 'CHECKBOX' : (q.question_type === 'dropdown' ? 'DROP_DOWN' : 'RADIO'),
          options: choiceOptions
        };
      } else if (q.question_type === 'rating') {
        item.createItem.item.questionItem.question.scaleQuestion = {
          low: 1,
          high: 5,
          lowLabel: 'Low',
          highLabel: 'High'
        };
      }

      requests.push(item);
    }

    if (requests.length > 0) {
      await forms.forms.batchUpdate({
        formId: formId,
        requestBody: { requests }
      });
    }

    console.log('Form created successfully!');
    console.log('Form ID:', formId);
    console.log('Form URL:', formUrl);

    // Store the Google Form ID and URL in the database
    await db.execute(
      'UPDATE questionnaires SET google_form_id = ?, google_form_url = ? WHERE id = ?',
      [formId, formUrl, questionnaireId]
    );

    res.json({ message: 'Form converted successfully', formUrl });

  } catch (error) {
    console.error('Conversion failed:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      status: error.status,
      response: error.response?.data
    });
    if (error.code === 401 || (error.response && error.response.status === 401)) {
      // Regenerate auth URL for re-authentication
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );
      const scopes = [
        'https://www.googleapis.com/auth/forms.body',
        'https://www.googleapis.com/auth/drive.file'
      ];
      const url = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: scopes,
        state: userId
      });

      return res.status(401).json({
        message: 'Google token expired or invalid',
        authUrl: url
      });
    }
    res.status(500).json({ message: 'Failed to convert to Google Form: ' + error.message });
  }
});

// Existing endpoints (placeholders for other functionality)
router.get('/responses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ items: [] });
});

// DELETE /api/questionnaires/:id - Delete a questionnaire and all its data
router.delete('/:id', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;

  try {
    // 1. Check if questionnaire exists
    const [questionnaires] = await db.execute(
      'SELECT id, title, google_form_id FROM questionnaires WHERE id = ?',
      [questionnaireId]
    );

    if (questionnaires.length === 0) {
      return res.status(404).json({ message: 'Questionnaire not found' });
    }

    const questionnaire = questionnaires[0];

    // 2. Delete all responses for this questionnaire
    await FormResponse.deleteByQuestionnaireId(questionnaireId);

    // 3. Delete all questions
    await db.execute(
      'DELETE FROM questionnaire_questions WHERE questionnaire_id = ?',
      [questionnaireId]
    );

    // 4. Delete sync logs
    await db.execute(
      'DELETE FROM questionnaire_sync_logs WHERE questionnaire_id = ?',
      [questionnaireId]
    );

    // 5. Delete the questionnaire itself
    await db.execute(
      'DELETE FROM questionnaires WHERE id = ?',
      [questionnaireId]
    );

    console.log(`Deleted questionnaire: ${questionnaire.title} (${questionnaireId})`);

    res.json({
      message: 'Questionnaire deleted successfully',
      deletedQuestionnaire: {
        id: questionnaireId,
        title: questionnaire.title
      }
    });
  } catch (error) {
    console.error('Failed to delete questionnaire:', error);
    res.status(500).json({ message: 'Failed to delete questionnaire' });
  }
});

// DELETE /api/questionnaires/responses/:responseId - Delete a single response
router.delete('/responses/:responseId', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const responseId = req.params.responseId;

  try {
    // Check if response exists
    const [responses] = await db.execute(
      'SELECT id, questionnaire_id FROM questionnaire_responses WHERE id = ?',
      [responseId]
    );

    if (responses.length === 0) {
      return res.status(404).json({ message: 'Response not found' });
    }

    const questionnaireId = responses[0].questionnaire_id;

    // Delete the response
    await db.execute(
      'DELETE FROM questionnaire_responses WHERE id = ?',
      [responseId]
    );

    // Update questionnaire total_responses count
    const [countResult] = await db.execute(
      'SELECT COUNT(*) as count FROM questionnaire_responses WHERE questionnaire_id = ?',
      [questionnaireId]
    );

    await db.execute(
      'UPDATE questionnaires SET total_responses = ? WHERE id = ?',
      [countResult[0].count, questionnaireId]
    );

    console.log(`Deleted response: ${responseId}`);

    res.json({
      message: 'Response deleted successfully',
      deletedResponseId: responseId
    });
  } catch (error) {
    console.error('Failed to delete response:', error);
    res.status(500).json({ message: 'Failed to delete response' });
  }
});

router.post('/assign', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.status(201).json({ id: null, scheduled: false });
});

// GET /api/questionnaires/forms/:id/responses - Get stored responses from database
router.get('/forms/:id/responses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;

  try {
    const responses = await FormResponse.findByQuestionnaireId(questionnaireId);
    const stats = await FormResponse.getResponseStats(questionnaireId);

    res.json({
      items: responses,
      stats: stats,
      total: responses.length
    });
  } catch (error) {
    console.error('Failed to fetch responses:', error);
    res.status(500).json({ message: 'Failed to fetch responses from database' });
  }
});

router.get('/forms/:id/export', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  res.json({ url: null, format: req.query.format || 'csv' });
});

// GET /api/questionnaires/:id/google-responses - Get Google Form Responses (Direct from API)
router.get('/:id/google-responses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;
  const userId = req.user.id;

  try {
    // 1. Get the Google Form ID from database
    const [questionnaireRows] = await db.execute(
      'SELECT google_form_id, google_form_url, title FROM questionnaires WHERE id = ?',
      [questionnaireId]
    );

    if (questionnaireRows.length === 0) {
      return res.status(404).json({ message: 'Questionnaire not found' });
    }

    const questionnaire = questionnaireRows[0];

    if (!questionnaire.google_form_id) {
      return res.status(400).json({ message: 'This questionnaire has not been converted to a Google Form yet' });
    }

    // 2. Get user's Google OAuth token
    const [tokens] = await db.execute(
      'SELECT access_token, refresh_token, expiry_date FROM oauth_tokens WHERE user_id = ?',
      [userId]
    );

    if (tokens.length === 0) {
      return res.status(401).json({ message: 'Google authentication required' });
    }

    const tokenData = tokens[0];
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date
    });

    // 3. Fetch responses from Google Forms API
    const forms = google.forms({ version: 'v1', auth: oauth2Client });

    const responsesData = await forms.forms.responses.list({
      formId: questionnaire.google_form_id
    });

    res.json({
      formTitle: questionnaire.title,
      formUrl: questionnaire.google_form_url,
      responses: responsesData.data.responses || [],
      totalResponses: responsesData.data.responses?.length || 0
    });

  } catch (error) {
    console.error('Failed to fetch responses:', error);
    res.status(500).json({ message: 'Failed to fetch form responses: ' + error.message });
  }
});

// POST /api/questionnaires/:id/sync-responses - Sync responses from Google Forms to database
router.post('/:id/sync-responses', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;
  const userId = req.user.id;

  console.log('=== Sync Responses ===');
  console.log('Questionnaire ID:', questionnaireId);
  console.log('User ID:', userId);

  let syncLogId;

  try {
    // Create sync log
    syncLogId = await FormResponse.createSyncLog(questionnaireId, 'manual');

    // 1. Get the Google Form ID from database
    const [questionnaireRows] = await db.execute(
      'SELECT google_form_id, google_form_url, title FROM questionnaires WHERE id = ?',
      [questionnaireId]
    );

    if (questionnaireRows.length === 0) {
      await FormResponse.updateSyncLog(syncLogId, {
        status: 'failed',
        error: 'Questionnaire not found',
        fetched: 0,
        new: 0,
        updated: 0,
        failed: 0
      });
      return res.status(404).json({ message: 'Questionnaire not found' });
    }

    const questionnaire = questionnaireRows[0];

    if (!questionnaire.google_form_id) {
      await FormResponse.updateSyncLog(syncLogId, {
        status: 'failed',
        error: 'Not converted to Google Form',
        fetched: 0,
        new: 0,
        updated: 0,
        failed: 0
      });
      return res.status(400).json({ message: 'This questionnaire has not been converted to a Google Form yet' });
    }

    // 2. Get user's Google OAuth token
    const [tokens] = await db.execute(
      'SELECT access_token, refresh_token, expiry_date FROM oauth_tokens WHERE user_id = ?',
      [userId]
    );

    if (tokens.length === 0) {
      await FormResponse.updateSyncLog(syncLogId, {
        status: 'failed',
        error: 'Google authentication required',
        fetched: 0,
        new: 0,
        updated: 0,
        failed: 0
      });
      return res.status(401).json({ message: 'Google authentication required' });
    }

    const tokenData = tokens[0];
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date
    });

    // 3. Fetch responses from Google Forms API
    const forms = google.forms({ version: 'v1', auth: oauth2Client });

    const responsesData = await forms.forms.responses.list({
      formId: questionnaire.google_form_id
    });

    const googleResponses = responsesData.data.responses || [];

    console.log(`Fetched ${googleResponses.length} responses from Google Forms`);

    // 4. Save responses to database
    let newCount = 0;
    let updatedCount = 0;
    let failedCount = 0;
    for (const response of googleResponses) {
      try {
        const exists = await FormResponse.existsByGoogleResponseId(response.responseId);
        await FormResponse.saveGoogleFormResponse(response, questionnaireId);

        if (exists) {
          updatedCount++;
        } else {
          newCount++;
        }
      } catch (error) {
        console.error('Failed to save response:', response.responseId);
        console.error('Error details:', error.message);
        console.error('Response structure:', JSON.stringify(response).substring(0, 200));
        failedCount++;
      }
    }

    // 5. Update questionnaire sync info
    await FormResponse.updateQuestionnaireSyncInfo(questionnaireId, googleResponses.length);

    // 6. Update sync log
    await FormResponse.updateSyncLog(syncLogId, {
      status: failedCount > 0 ? 'partial' : 'completed',
      fetched: googleResponses.length,
      new: newCount,
      updated: updatedCount,
      failed: failedCount
    });

    console.log(`Sync completed: ${newCount} new, ${updatedCount} updated, ${failedCount} failed`);

    res.json({
      message: 'Responses synced successfully',
      summary: {
        fetched: googleResponses.length,
        new: newCount,
        updated: updatedCount,
        failed: failedCount,
        total: googleResponses.length
      }
    });

  } catch (error) {
    console.error('Sync failed:', error);

    if (syncLogId) {
      await FormResponse.updateSyncLog(syncLogId, {
        status: 'failed',
        error: error.message,
        fetched: 0,
        new: 0,
        updated: 0,
        failed: 0
      });
    }

    res.status(500).json({ message: 'Failed to sync responses: ' + error.message });
  }
});

// POST /api/questionnaires/:id/export-to-sheets - Export responses to Google Sheets
router.post('/:id/export-to-sheets', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;
  const userId = req.user.id;

  console.log('=== Export to Google Sheets ===');
  console.log('Questionnaire ID:', questionnaireId);

  try {
    // 1. Get questionnaire
    const [questionnaireRows] = await db.execute(
      'SELECT * FROM questionnaires WHERE id = ?',
      [questionnaireId]
    );

    if (questionnaireRows.length === 0) {
      return res.status(404).json({ message: 'Questionnaire not found' });
    }

    const questionnaire = questionnaireRows[0];

    // 2. Get questions
    const [questions] = await db.execute(
      'SELECT * FROM questionnaire_questions WHERE questionnaire_id = ? ORDER BY order_index ASC',
      [questionnaireId]
    );

    if (questions.length === 0) {
      return res.status(400).json({ message: 'No questions found for this questionnaire' });
    }

    // 3. Get responses from database
    const responses = await FormResponse.findByQuestionnaireId(questionnaireId);

    if (responses.length === 0) {
      return res.status(400).json({ message: 'No responses to export. Please sync responses first.' });
    }

    // 4. Get user's Google OAuth token
    const [tokens] = await db.execute(
      'SELECT access_token, refresh_token, expiry_date FROM oauth_tokens WHERE user_id = ?',
      [userId]
    );

    if (tokens.length === 0) {
      return res.status(401).json({ message: 'Google authentication required' });
    }

    const tokenData = tokens[0];
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expiry_date: tokenData.expiry_date
    });

    // 5. Create Google Sheet
    const sheetsService = new SheetsService(oauth2Client);
    const sheetInfo = await sheetsService.exportResponsesToSheet(questionnaire, questions, responses);

    // 6. Update questionnaire with sheet URL
    await db.execute(
      'UPDATE questionnaire_responses SET google_sheet_url = ? WHERE questionnaire_id = ?',
      [sheetInfo.spreadsheetUrl, questionnaireId]
    );

    console.log('Export completed:', sheetInfo.spreadsheetUrl);

    res.json({
      message: 'Responses exported to Google Sheets successfully',
      spreadsheetId: sheetInfo.spreadsheetId,
      spreadsheetUrl: sheetInfo.spreadsheetUrl,
      totalResponses: responses.length
    });

  } catch (error) {
    console.error('Export failed:', error);
    res.status(500).json({ message: 'Failed to export to Google Sheets: ' + error.message });
  }
});

// GET /api/questionnaires/:id/sync-status - Get sync status and statistics
router.get('/:id/sync-status', authenticateToken, requireRole(['admin', 'manager']), async (req, res) => {
  const questionnaireId = req.params.id;

  try {
    // Get questionnaire info
    const [questionnaireRows] = await db.execute(
      'SELECT last_synced_at, total_responses, google_form_id FROM questionnaires WHERE id = ?',
      [questionnaireId]
    );

    if (questionnaireRows.length === 0) {
      return res.status(404).json({ message: 'Questionnaire not found' });
    }

    const questionnaire = questionnaireRows[0];

    // Get response stats
    const stats = await FormResponse.getResponseStats(questionnaireId);

    // Get recent sync logs
    const syncLogs = await FormResponse.getSyncLogs(questionnaireId, 5);

    res.json({
      hasGoogleForm: !!questionnaire.google_form_id,
      lastSyncedAt: questionnaire.last_synced_at,
      totalResponses: questionnaire.total_responses,
      stats: stats,
      recentSyncs: syncLogs
    });

  } catch (error) {
    console.error('Failed to get sync status:', error);
    res.status(500).json({ message: 'Failed to get sync status' });
  }
});

export default router;