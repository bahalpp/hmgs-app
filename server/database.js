const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const seedPart1 = require('./questions-seed');
const seedPart2 = require('./questions-seed2');
const seedPart3 = require('./questions-seed3');
const seedPart4 = require('./questions-seed4');
const seedPart5 = require('./questions-seed5');

const dbPath = path.resolve(__dirname, 'hmgs.db');
const db = new sqlite3.Database(dbPath);

const allQuestions = [...seedPart1, ...seedPart2, ...seedPart3, ...seedPart4, ...seedPart5];

const subjects = [...new Set(allQuestions.map(q => q[0]))];

function initDb() {
    db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS questions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            subject TEXT, question_text TEXT,
            option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT, option_e TEXT,
            correct_answer TEXT, explanation TEXT, topic_summary TEXT
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS weekly_exams (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            week_number INTEGER, exam_number INTEGER,
            week_start TEXT, questions_json TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        )`);

        db.run(`CREATE TABLE IF NOT EXISTS exam_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exam_id INTEGER, score REAL,
            correct_count INTEGER, wrong_count INTEGER, blank_count INTEGER,
            total_time INTEGER, answers_json TEXT,
            completed_at TEXT DEFAULT (datetime('now'))
        )`);

        db.get("SELECT COUNT(*) as c FROM questions", (err, row) => {
            if (row && row.c === 0) {
                const stmt = db.prepare(`INSERT INTO questions (subject,question_text,option_a,option_b,option_c,option_d,option_e,correct_answer,explanation,topic_summary) VALUES (?,?,?,?,?,?,?,?,?,?)`);
                allQuestions.forEach(q => stmt.run(...q));
                stmt.finalize();
                console.log(`Seeded ${allQuestions.length} questions across ${subjects.length} subjects`);
            }
        });
    });
}

module.exports = { db, initDb, subjects };
