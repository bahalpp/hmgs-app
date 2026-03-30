const express = require('express');
const cors = require('cors');
const { db, initDb, subjects } = require('./database');

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
initDb();

// FORCED CACHE WIPE: Eski algoritmanın ürettiği haftalık denemeleri sil.
db.run("DELETE FROM weekly_exams", (err) => {
    if(!err) console.log("Eski denemeler temizlendi, yeni algoritma devrede.");
});

// Hafta numarasını hesapla (yılın başından itibaren)
function getWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000));
}

// Haftanın Pazartesi tarihini bul
function getMonday() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

// Fisher-Yates Shuffle 
function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

// Haftalık 5 denemeyi üret veya cache'den döndür
app.get('/api/weekly-exams', async (req, res) => {
    const weekNum = getWeekNumber();
    const monday = getMonday();

    db.all("SELECT * FROM weekly_exams WHERE week_number = ?", [weekNum], async (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });

        if (rows && rows.length === 5) {
            // Bu haftanın denemeleri zaten var
            const exams = rows.map(r => ({
                id: r.id, examNumber: r.exam_number,
                weekStart: r.week_start,
                questions: JSON.parse(r.questions_json)
            }));
            return res.json({ weekNumber: weekNum, weekStart: monday, exams });
        }

        // Yoksa 5 deneme üret
        try {
            // Önce eski denemeleri temizle (10 haftadan eski)
            db.run("DELETE FROM weekly_exams WHERE week_number < ?", [weekNum - 10]);

            // Her dersin tüm sorularını çekip karıştıralım
            const pools = {};
            for (const subject of subjects) {
                const qs = await new Promise((r, j) => {
                    db.all("SELECT * FROM questions WHERE subject = ?", [subject], (err, row) => err ? j(err) : r(row));
                });
                pools[subject] = shuffle([...qs]);
            }

            const exams = [];
            for (let i = 1; i <= 5; i++) {
                let examQuestions = [];
                for (const subject of subjects) {
                    // Eğer havuzda 5'ten az soru kaldıysa, sıfırdan tüm soruları çekip tekrar karıştırıp havuza ekle
                    if (pools[subject].length < 5) {
                        const qs = await new Promise((r, j) => {
                            db.all("SELECT * FROM questions WHERE subject = ?", [subject], (err, row) => err ? j(err) : r(row));
                        });
                        pools[subject] = pools[subject].concat(shuffle([...qs]));
                    }
                    const selected = pools[subject].splice(0, 5);
                    examQuestions = examQuestions.concat(selected);
                }

                const json = JSON.stringify(examQuestions);
                await new Promise((resolve, reject) => {
                    db.run(
                        "INSERT INTO weekly_exams (week_number, exam_number, week_start, questions_json) VALUES (?,?,?,?)",
                        [weekNum, i, monday, json],
                        function(err) {
                            if (err) reject(err);
                            exams.push({ id: this.lastID, examNumber: i, weekStart: monday, questions: examQuestions });
                            resolve();
                        }
                    );
                });
            }
            res.json({ weekNumber: weekNum, weekStart: monday, exams });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });
});

// Tek deneme getir
app.get('/api/exam/:id', (req, res) => {
    db.get("SELECT * FROM weekly_exams WHERE id = ?", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.status(404).json({ error: 'Deneme bulunamadı' });
        res.json({ ...row, questions: JSON.parse(row.questions_json) });
    });
});

// Sonuç kaydet
app.post('/api/results', (req, res) => {
    const { examId, score, correctCount, wrongCount, blankCount, totalTime, answers } = req.body;
    db.run(
        `INSERT INTO exam_results (exam_id, score, correct_count, wrong_count, blank_count, total_time, answers_json) VALUES (?,?,?,?,?,?,?)`,
        [examId, score, correctCount, wrongCount, blankCount, totalTime, JSON.stringify(answers)],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// Geçmiş sonuçlar
app.get('/api/results', (req, res) => {
    db.all(`SELECT er.*, we.exam_number, we.week_start 
            FROM exam_results er 
            LEFT JOIN weekly_exams we ON er.exam_id = we.id 
            ORDER BY er.completed_at DESC LIMIT 20`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// İstatistikler
app.get('/api/stats', (req, res) => {
    db.all(`SELECT * FROM exam_results ORDER BY completed_at DESC LIMIT 30`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Flashcards (Hap Bilgi)
app.get('/api/flashcards', (req, res) => {
    db.all(`SELECT id, subject, question_text, option_a, option_b, option_c, option_d, option_e, correct_answer, topic_summary 
            FROM questions ORDER BY RANDOM() LIMIT 30`, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const flashcards = rows.map(q => ({
            id: q.id,
            subject: q.subject,
            front: q.question_text,
            answer: q[`option_${q.correct_answer.toLowerCase()}`],
            summary: q.topic_summary
        }));
        res.json(flashcards);
    });
});

app.listen(PORT, () => console.log(`HMGS Server: http://localhost:${PORT}`));
