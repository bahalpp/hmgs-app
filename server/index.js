const express = require('express');
const cors = require('cors');
const { supabase, initDb, subjects } = require('./database');
const cron = require('node-cron');
const { askAIForQuestions } = require('./question-generator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

// Veritabanı Seed Ataması
initDb();

// Yılın başından itibaren hafta numarası
function getWeekNumber() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = now - start;
    return Math.ceil(diff / (7 * 24 * 60 * 60 * 1000)) + 2000;
}

// Haftanın Pazartesi gününün YYYY-MM-DD olarak temsili
function getMonday() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function shuffle(array) {
    let currentIndex = array.length, randomIndex;
    while (currentIndex !== 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
}

// ---------------- API ENDPOINT'LERİ ----------------

// Haftalık 5 denemeyi getir veya oluştur
app.get('/api/weekly-exams', async (req, res) => {
    if (!supabase) return res.status(500).json({ error: "Supabase kurulu değil" });
    const weekNum = getWeekNumber();
    const monday = getMonday();

    try {
        const { data: rows, error } = await supabase
            .from('weekly_exams')
            .select('*')
            .eq('week_number', weekNum);

        if (error) throw error;

        // Varsa direkt Cache'den dön;
        if (rows && rows.length === 5) {
            const exams = rows.map(r => ({
                id: r.id, 
                examNumber: r.exam_number,
                weekStart: r.week_start,
                questions: r.questions_json // JSONB olduğu için otomatik nesne olarak gelir
            })).sort((a,b) => a.examNumber - b.examNumber);
            return res.json({ weekNumber: weekNum, weekStart: monday, exams });
        }

        // Yoksa eskileri temizleyip o hafta için YENİ DENEME yarat.
        await supabase.from('weekly_exams').delete().lt('week_number', weekNum - 10); // Eski kayıtları süpür

        // Tüm soruları Supabase'den çek
        const { data: allQs, error: qErr } = await supabase.from('questions').select('*');
        if (qErr) throw qErr;

        // Derslerine göre parselle ve karıştır
        const pools = {};
        for (const subject of subjects) {
            const qs = allQs.filter(q => q.subject === subject);
            pools[subject] = shuffle([...qs]);
        }

        const exams = [];
        for (let i = 1; i <= 5; i++) {
            let examQuestions = [];
            for (const subject of subjects) {
                let qs = pools[subject] || [];
                let indices = [];

                if (qs.length >= 10) {
                    if (i === 1) indices = [0,1,2,3,4];       // 0 ile başlar
                    else if (i === 2) indices = [5,6,7,8,9];  // 5 ile başlar
                    else if (i === 3) indices = [1,3,5,7,9];  // 1 ile başlar
                    else if (i === 4) indices = [2,4,6,8,0];  // 2 ile başlar
                    else if (i === 5) indices = [3,6,9,1,4];  // 3 ile başlar
                } else {
                    indices = shuffle([...Array(qs.length).keys()]).slice(0, 5);
                }
                
                const selected = indices.map(idx => qs[idx]);
                // Undefined objeleri temizle (soru eksikliği varsa patlamaması için)
                examQuestions = examQuestions.concat(selected.filter(Boolean));
            }

            // Supabase JSONB olarak dizileyip yolla.
            const { data: insertedData, error: insertError } = await supabase
                .from('weekly_exams')
                .insert([{
                    week_number: weekNum,
                    exam_number: i,
                    week_start: monday,
                    questions_json: examQuestions
                }])
                .select();
                
            if (insertError) throw insertError;
            
            exams.push({ 
                id: insertedData[0].id, 
                examNumber: i, 
                weekStart: monday, 
                questions: examQuestions 
            });
        }
        res.json({ weekNumber: weekNum, weekStart: monday, exams });

    } catch (e) {
        console.error("Weekly Exam Üretim Hatası:", e);
        res.status(500).json({ error: e.message });
    }
});

// Tek deneme getir
app.get('/api/exam/:id', async (req, res) => {
    try {
        const { data: row, error } = await supabase
            .from('weekly_exams')
            .select('*')
            .eq('id', req.params.id)
            .single();

        if (error) throw error;
        if (!row) return res.status(404).json({ error: 'Deneme bulunamadı' });

        res.json({ ...row, questions: row.questions_json });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Sonuç kaydet (Sınav sonuçları bağımsız olarak loglanacak)
app.post('/api/results', async (req, res) => {
    const { examId, score, correctCount, wrongCount, blankCount, totalTime, answers } = req.body;
    try {
        // Hangi sınav olduğunu bulmak için weekly_exams tablosuna bir bakalım
        let examNo = 0;
        let weekSt = "";
        const { data: examInfo } = await supabase.from('weekly_exams').select('exam_number, week_start').eq('id', examId).single();
        if (examInfo) {
            examNo = examInfo.exam_number;
            weekSt = examInfo.week_start;
        }

        const { data, error } = await supabase.from('exam_results').insert([{
            exam_id: examId,
            exam_number: examNo,
            week_start: weekSt,
            score: score,
            correct_count: correctCount,
            wrong_count: wrongCount,
            empty_count: blankCount,
            total_time: totalTime,
            answers_json: answers
        }]).select();

        if (error) throw error;
        res.json({ id: data[0].id });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Geçmiş sonuçları ve istatistikleri çek (Buluttan kopmadan listeleme)
app.get('/api/results', async (req, res) => {
    try {
        const { data: rows, error } = await supabase
            .from('exam_results')
            .select('*')
            .order('completed_at', { ascending: false })
            .limit(20);

        if (error) throw error;
        res.json(rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// İstatistikler Grafik Verisi
app.get('/api/stats', async (req, res) => {
    try {
        const { data: rows, error } = await supabase
            .from('exam_results')
            .select('*')
            .order('completed_at', { ascending: false })
            .limit(30);

        if (error) throw error;
        res.json(rows);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Flashcards (Rastgele Soru Çekimi) - Supabase'deki özel PostgreSQL Fonksiyonunu çağırır
app.get('/api/flashcards', async (req, res) => {
    try {
        // Eğer SQL Editor'dan get_random_questions fonksiyonunu okutmuşlarsa:
        const { data: rows, error } = await supabase.rpc('get_random_questions', { limit_count: 30 });
        
        if (error) throw error;

        const flashcards = rows.map(q => ({
            id: q.id,
            subject: q.subject,
            front: q.question_text,
            answer: q[`option_${q.correct_answer.toLowerCase()}`] || '',
            summary: q.topic_summary
        }));
        res.json(flashcards);
    } catch(e) {
        console.error("Flashcard çekme hatası (SQL Editor kurulumunu unutmuş olabilirsiniz):", e);
        res.status(500).json({ error: e.message });
    }
});

// --- YAPAY ZEKA OTOMATİK SORU ÜRETİM MOTORU ---

const sleep = ms => new Promise(r => setTimeout(r, ms));

let lastExecutionLog = "Arka plan AI motoru henüz çalıştırılmadı.";
let isGenerating = false;

async function generateAllSubjectsQuestions(limit = subjects.length) {
    if (isGenerating) {
        lastExecutionLog += `\n[${new Date().toISOString()}] UYARI: Zaten bir üretim işlemi devam ediyor. Yeni istek reddedildi.\n`;
        return;
    }
    
    isGenerating = true;
    lastExecutionLog = `[${new Date().toISOString()}] AI Soru Üretim Motoru Başlatıldı (1.5 Pro Modu). Hedef: 5 Deneme Sınavı x 120 Soru\n`;
    let allNewQuestions = [];
    
    try {
        let processSubjects = subjects.slice(0, limit);

        for (const subjectObj of processSubjects) {
            const requestedCount = subjectObj.countPerExam * 5; // 5 Deneme için toplam soru
            lastExecutionLog += `[*] ${subjectObj.name} için ${requestedCount} akademik soru isteniyor...\n`;
            
            try {
                const newQs = await askAIForQuestions(subjectObj.name, requestedCount);
                if (newQs && newQs.length > 0) {
                    allNewQuestions = allNewQuestions.concat(newQs);
                    lastExecutionLog += `  -> BAŞARILI: ${newQs.length} soru alındı.\n`;
                } else {
                    lastExecutionLog += `  -> BAŞARISIZ: 0 soru döndü.\n`;
                }
            } catch(e) {
                lastExecutionLog += `  -> [HATA]: ${subjectObj.name} dersinde sorun: ${e.message}\n`;
            }

            // Gemini 1.5 Flash Ücretsiz Kotası: 15 RPM. 
            // 5 saniye beklemek yeterli ve çok daha hızlı.
            if (processSubjects.indexOf(subjectObj) < processSubjects.length - 1) {
                lastExecutionLog += `  -> Mola veriliyor (5 sn)...\n`;
                await sleep(5000); 
            }
        }

        if (allNewQuestions.length >= 100) { // En azından bir miktar soru gelmiş olmalı
            lastExecutionLog += `\n[${new Date().toISOString()}] Veritabanı Yenileniyor...\n`;
            
            // 1. Mevcut tüm soruları ve denemeleri sil
            await supabase.from('questions').delete().neq('id', 0);
            await supabase.from('weekly_exams').delete().neq('id', 0);
                
            // 2. Soruları 'questions' tablosuna enjekte et
            const insertData = allNewQuestions.map(q => ({
                subject: q[0],
                question_text: q[1],
                option_a: q[2],
                option_b: q[3],
                option_c: q[4],
                option_d: q[5],
                option_e: q[6],
                correct_answer: q[7],
                explanation: q[8],
                topic_summary: q[9]
            }));

            const { error: insertError } = await supabase.from('questions').insert(insertData);
            if (insertError) {
                 lastExecutionLog += `[HATA] Soru enjeksiyonu başarısız: ${insertError.message}\n`;
                 throw insertError;
            }

            // 3. 5 ADET BENZERSİZ DENEME SINAVI OLUŞTUR
            // Her deneme 120 soru (ÖSYM dağılımına uygun)
            lastExecutionLog += `[${new Date().toISOString()}] 5 Adet Benzersiz Deneme Sınavı Hazırlanıyor...\n`;
            
            const weekStart = new Date().toISOString().split('T')[0];
            const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

            for (let i = 1; i <= 5; i++) {
                let examQuestions = [];
                
                // Her ders için o dersin sorularından countPerExam kadarını bu denemeye al
                for (const subj of subjects) {
                    const subjQs = allNewQuestions.filter(q => q[0] === subj.name);
                    // Her deneme için farklı sorular seçmek için (i-1)*countPerExam'den başla
                    const startIdx = (i - 1) * subj.countPerExam;
                    const selected = subjQs.slice(startIdx, startIdx + subj.countPerExam);
                    
                    examQuestions = examQuestions.concat(selected.map(q => ({
                        subject: q[0],
                        question_text: q[1],
                        option_a: q[2],
                        option_b: q[3],
                        option_c: q[4],
                        option_d: q[5],
                        option_e: q[6],
                        correct_answer: q[7],
                        explanation: q[8],
                        topic_summary: q[9]
                    })));
                }

                // Sınavın içindeki soruları karıştır (Shuffle)
                examQuestions = examQuestions.sort(() => Math.random() - 0.5);

                await supabase.from('weekly_exams').insert({
                    week_number: weekNumber,
                    exam_number: i,
                    week_start: weekStart,
                    questions_json: examQuestions
                });
            }

            lastExecutionLog += `[MUTLU SON] 5 Deneme Sınavı (Toplam ${allNewQuestions.length} soru) başarıyla oluşturuldu!\n`;
        } else {
            lastExecutionLog += `\n[HATA] Yeterli soru üretilemedi (${allNewQuestions.length}). Süreç iptal.\n`;
        }
    } catch (globalErr) {
        lastExecutionLog += `\n[KRİTİK SİSTEM HATASI]: ${globalErr.message}\n`;
    } finally {
        isGenerating = false;
    }
}

// 1. OTOMATİK SİSTEM: Her Pazar gecesi saat 03:00'te uyan, havuzu SIFIRLA ve 500 soru çek.
cron.schedule('0 3 * * 0', async () => {
    console.log("Zamanlayıcı tetiklendi: Haftalık Yık-Yap Soru Üretimi (Bulut Modu)");
    await generateAllSubjectsQuestions();
});

// 2. MANUEL (KULLANICI) SİSTEMİ: Admin butona basarsa soru üretir ve sonucu arkadan işler.
app.all('/api/admin/generate-questions', (req, res) => {
    const adminPassword = req.body?.password || req.query?.password;
    if (adminPassword !== 'avuka2026') return res.status(401).json({ error: "Geçersiz şifre" });
    
    let limit = subjects.length;
    if (req.query.limit) limit = parseInt(req.query.limit);

    // Render'ın 2 dakikalık Time-out sınırına takılmamak için işlemi arka plana atıp hemen yanıt dönüyoruz.
    generateAllSubjectsQuestions(limit).catch(e => console.error(e));
    
    const countMsg = limit < subjects.length ? limit : subjects.length;
    res.json({ message: `Sistem başarıyla tetiklendi! Toplam ${countMsg} ders için arka planda Yapay Zeka üretimi başladı. Yaklaşık 3-4 dakika sürecektir. Bittiğinde şu log adresinden raporu okuyabilirsin: /api/admin/logs` });
});

app.get('/api/admin/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(lastExecutionLog);
});

app.listen(PORT, () => {
    console.log(`Supabase-Destekli Sunucu ${PORT} portunda başarıyla çalışıyor.`);
});
