import pool from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * FormResponse Model
 * Handles storage and retrieval of Google Forms responses in the database
 */
export class FormResponse {
    /**
     * Save a Google Form response to the database
     * @param {object} responseData - The response data from Google Forms API
     * @param {string} questionnaireId - The questionnaire ID
     * @returns {Promise<string>} The ID of the saved response
     */
    static async saveGoogleFormResponse(responseData, questionnaireId) {
        const id = uuidv4();
        const googleResponseId = responseData.responseId;

        // Parse answers from Google Forms format to simple key-value pairs
        const answers = this.parseGoogleFormAnswers(responseData.answers);

        try {
            await pool.execute(
                `INSERT INTO questionnaire_responses 
        (id, google_response_id, questionnaire_id, responder_id, answers, response_data, synced_at, sync_status) 
        VALUES (?, ?, ?, ?, ?, ?, NOW(), 'synced')
        ON DUPLICATE KEY UPDATE 
        answers = VALUES(answers),
        response_data = VALUES(response_data),
        synced_at = NOW(),
        sync_status = 'synced'`,
                [id, googleResponseId, questionnaireId, null, JSON.stringify(answers), JSON.stringify(responseData)]
            );

            return id;
        } catch (error) {
            console.error('Error saving response:', error);
            throw error;
        }
    }

    /**
     * Parse Google Forms answers into a simple format
     * @param {object} googleAnswers - Answers from Google Forms API
     * @returns {object} Simplified answers object
     */
    static parseGoogleFormAnswers(googleAnswers) {
        if (!googleAnswers) return {};

        const parsed = {};

        for (const [questionId, answerData] of Object.entries(googleAnswers)) {
            if (answerData.textAnswers) {
                // Text answers (short text, long text)
                const values = answerData.textAnswers.answers.map(a => a.value);
                parsed[questionId] = values.length === 1 ? values[0] : values;
            } else if (answerData.fileUploadAnswers) {
                // File upload answers
                parsed[questionId] = answerData.fileUploadAnswers.answers.map(a => a.fileId);
            }
        }

        return parsed;
    }

    /**
     * Find all responses for a questionnaire
     * @param {string} questionnaireId - The questionnaire ID
     * @returns {Promise<Array>} Array of responses
     */
    static async findByQuestionnaireId(questionnaireId) {
        const [rows] = await pool.execute(
            `SELECT * FROM questionnaire_responses 
       WHERE questionnaire_id = ? 
       ORDER BY created_at DESC`,
            [questionnaireId]
        );

        // Parse JSON fields
        return rows.map(row => ({
            ...row,
            answers: typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers,
            response_data: typeof row.response_data === 'string' ? JSON.parse(row.response_data) : row.response_data
        }));
    }

    /**
     * Check if a Google Form response already exists
     * @param {string} googleResponseId - The Google response ID
     * @returns {Promise<boolean>} True if exists
     */
    static async existsByGoogleResponseId(googleResponseId) {
        const [rows] = await pool.execute(
            'SELECT id FROM questionnaire_responses WHERE google_response_id = ?',
            [googleResponseId]
        );
        return rows.length > 0;
    }

    /**
     * Get response statistics for a questionnaire
     * @param {string} questionnaireId - The questionnaire ID
     * @returns {Promise<object>} Statistics object
     */
    static async getResponseStats(questionnaireId) {
        const [rows] = await pool.execute(
            `SELECT 
        COUNT(*) as total_responses,
        COUNT(CASE WHEN sync_status = 'synced' THEN 1 END) as synced_responses,
        COUNT(CASE WHEN sync_status = 'failed' THEN 1 END) as failed_responses,
        MAX(synced_at) as last_synced_at,
        MIN(created_at) as first_response_at,
        MAX(created_at) as latest_response_at
       FROM questionnaire_responses 
       WHERE questionnaire_id = ?`,
            [questionnaireId]
        );

        return rows[0];
    }

    /**
     * Update sync status for a response
     * @param {string} id - The response ID
     * @param {string} status - The sync status
     * @param {string} errorMessage - Optional error message
     */
    static async updateSyncStatus(id, status, errorMessage = null) {
        await pool.execute(
            `UPDATE questionnaire_responses 
       SET sync_status = ?, synced_at = NOW() 
       WHERE id = ?`,
            [status, id]
        );
    }

    /**
     * Delete all responses for a questionnaire
     * @param {string} questionnaireId - The questionnaire ID
     */
    static async deleteByQuestionnaireId(questionnaireId) {
        const [result] = await pool.execute(
            'DELETE FROM questionnaire_responses WHERE questionnaire_id = ?',
            [questionnaireId]
        );
        return result.affectedRows;
    }

    /**
     * Create a sync log entry
     * @param {string} questionnaireId - The questionnaire ID
     * @param {string} syncType - Type of sync (manual, automatic, scheduled)
     * @returns {Promise<string>} The sync log ID
     */
    static async createSyncLog(questionnaireId, syncType = 'manual') {
        const id = uuidv4();
        await pool.execute(
            `INSERT INTO questionnaire_sync_logs 
       (id, questionnaire_id, sync_type, sync_status, started_at) 
       VALUES (?, ?, ?, 'in_progress', NOW())`,
            [id, questionnaireId, syncType]
        );
        return id;
    }

    /**
     * Update sync log with results
     * @param {string} syncLogId - The sync log ID
     * @param {object} results - Sync results
     */
    static async updateSyncLog(syncLogId, results) {
        await pool.execute(
            `UPDATE questionnaire_sync_logs 
       SET responses_fetched = ?,
           responses_new = ?,
           responses_updated = ?,
           responses_failed = ?,
           sync_status = ?,
           error_message = ?,
           completed_at = NOW()
       WHERE id = ?`,
            [
                results.fetched || 0,
                results.new || 0,
                results.updated || 0,
                results.failed || 0,
                results.status || 'completed',
                results.error || null,
                syncLogId
            ]
        );
    }

    /**
     * Get sync logs for a questionnaire
     * @param {string} questionnaireId - The questionnaire ID
     * @param {number} limit - Number of logs to retrieve
     * @returns {Promise<Array>} Array of sync logs
     */
    static async getSyncLogs(questionnaireId, limit = 10) {
        const [rows] = await pool.execute(
            `SELECT * FROM questionnaire_sync_logs 
       WHERE questionnaire_id = ? 
       ORDER BY started_at DESC 
       LIMIT ?`,
            [questionnaireId, limit]
        );
        return rows;
    }

    /**
     * Update questionnaire's last synced timestamp and total responses
     * @param {string} questionnaireId - The questionnaire ID
     * @param {number} totalResponses - Total number of responses
     */
    static async updateQuestionnaireSyncInfo(questionnaireId, totalResponses) {
        await pool.execute(
            `UPDATE questionnaires 
       SET last_synced_at = NOW(), total_responses = ? 
       WHERE id = ?`,
            [totalResponses, questionnaireId]
        );
    }
}
