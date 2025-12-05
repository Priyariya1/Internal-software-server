import { google } from 'googleapis';

/**
 * Google Sheets Service
 * Handles creating and updating Google Sheets with questionnaire responses
 */
export class SheetsService {
    constructor(oauth2Client) {
        this.auth = oauth2Client;
        this.sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    }

    /**
     * Create a new Google Sheet for questionnaire responses
     * @param {string} title - Sheet title
     * @param {Array} headers - Column headers
     * @param {Array} rows - Data rows
     * @returns {Promise<object>} Sheet info with spreadsheetId and url
     */
    async createSpreadsheet(title, headers, rows) {
        try {
            // Create the spreadsheet
            const createResponse = await this.sheets.spreadsheets.create({
                requestBody: {
                    properties: {
                        title: title
                    },
                    sheets: [{
                        properties: {
                            title: 'Responses',
                            gridProperties: {
                                frozenRowCount: 1
                            }
                        }
                    }]
                }
            });

            const spreadsheetId = createResponse.data.spreadsheetId;
            const spreadsheetUrl = createResponse.data.spreadsheetUrl;

            // Add data to the sheet
            await this.updateSheetData(spreadsheetId, 'Responses', headers, rows);

            // Format the header row
            await this.formatHeaderRow(spreadsheetId, 0);

            return {
                spreadsheetId,
                spreadsheetUrl
            };
        } catch (error) {
            console.error('Error creating spreadsheet:', error);
            throw error;
        }
    }

    /**
     * Update sheet data
     * @param {string} spreadsheetId - The spreadsheet ID
     * @param {string} sheetName - The sheet name
     * @param {Array} headers - Column headers
     * @param {Array} rows - Data rows
     */
    async updateSheetData(spreadsheetId, sheetName, headers, rows) {
        const values = [headers, ...rows];

        await this.sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: {
                values
            }
        });
    }

    /**
     * Format the header row (bold, background color)
     * @param {string} spreadsheetId - The spreadsheet ID
     * @param {number} sheetId - The sheet ID
     */
    async formatHeaderRow(spreadsheetId, sheetId) {
        await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
                requests: [
                    {
                        repeatCell: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: {
                                        red: 0.2,
                                        green: 0.2,
                                        blue: 0.2
                                    },
                                    textFormat: {
                                        foregroundColor: {
                                            red: 1.0,
                                            green: 1.0,
                                            blue: 1.0
                                        },
                                        fontSize: 11,
                                        bold: true
                                    }
                                }
                            },
                            fields: 'userEnteredFormat(backgroundColor,textFormat)'
                        }
                    }
                ]
            }
        });
    }

    /**
     * Export questionnaire responses to Google Sheets
     * @param {object} questionnaire - Questionnaire data
     * @param {Array} questions - Questions array
     * @param {Array} responses - Responses array
     * @returns {Promise<object>} Sheet info
     */
    async exportResponsesToSheet(questionnaire, questions, responses) {
        // Build headers
        const headers = [
            'Response ID',
            'Submitted At',
            ...questions.map(q => q.question_text)
        ];

        // Build rows
        const rows = responses.map(response => {
            const row = [
                response.google_response_id || response.id,
                response.created_at || new Date().toISOString()
            ];

            // Add answer for each question
            questions.forEach(question => {
                const answer = response.answers?.[question.id] || '';
                // Handle array answers (checkboxes)
                const answerText = Array.isArray(answer) ? answer.join(', ') : answer;
                row.push(answerText);
            });

            return row;
        });

        const title = `${questionnaire.title} - Responses`;
        return await this.createSpreadsheet(title, headers, rows);
    }

    /**
     * Append new responses to existing sheet
     * @param {string} spreadsheetId - The spreadsheet ID
     * @param {string} sheetName - The sheet name
     * @param {Array} rows - New rows to append
     */
    async appendRows(spreadsheetId, sheetName, rows) {
        await this.sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `${sheetName}!A1`,
            valueInputOption: 'RAW',
            requestBody: {
                values: rows
            }
        });
    }

    /**
     * Share sheet with specific email addresses
     * @param {string} spreadsheetId - The spreadsheet ID
     * @param {Array} emails - Email addresses to share with
     * @param {string} role - Permission role (reader, writer, owner)
     */
    async shareSheet(spreadsheetId, emails, role = 'reader') {
        const drive = google.drive({ version: 'v3', auth: this.auth });

        for (const email of emails) {
            try {
                await drive.permissions.create({
                    fileId: spreadsheetId,
                    requestBody: {
                        type: 'user',
                        role: role,
                        emailAddress: email
                    },
                    sendNotificationEmail: true
                });
            } catch (error) {
                console.error(`Error sharing with ${email}:`, error);
            }
        }
    }

    /**
     * Get spreadsheet info
     * @param {string} spreadsheetId - The spreadsheet ID
     * @returns {Promise<object>} Spreadsheet metadata
     */
    async getSpreadsheetInfo(spreadsheetId) {
        const response = await this.sheets.spreadsheets.get({
            spreadsheetId
        });
        return response.data;
    }
}
