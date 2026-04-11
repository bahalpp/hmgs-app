const express = require('express');
const cors = require('cors');
const { supabase, initDb, subjects } = require('./database');
const cron = require('node-cron');
const { askAIForQuestions, askAIForBatchQuestions } = require('./question-generator');
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
        for (const subjectObj of subjects) {
            const qs = allQs.filter(q => q.subject === subjectObj.name);
            pools[subjectObj.name] = shuffle([...qs]);
        }

        const exams = [];
        for (let i = 1; i <= 5; i++) {
            let examQuestions = [];
            for (const subjectObj of subjects) {
                let qs = pools[subjectObj.name] || [];
                const countNeeded = subjectObj.countPerExam;
                
                // Her sınavda farklı sorular gelmesi için basit bir kaydırma (offset) mantığı
                // Not: Eğer havuzda yeterli soru yoksa shuffle edilmiş havuzdan ihtiyaç kadarını alırız.
                let selected = [];
                if (qs.length >= countNeeded * 1.5) {
                    // Basit bir kaydırma ile farklı soruların gelmesini sağla
                    const startIdx = (i - 1) * Math.floor(qs.length / 5);
                    selected = qs.slice(startIdx, startIdx + countNeeded);
                } else {
                    // Soru azsa rastgele karıştırıp ihtiyacımız olan kadarını alalım
                    selected = shuffle([...qs]).slice(0, countNeeded);
                }
                
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

// --- YAPAY ZEKA PARALel 5-WORKER SORU ÜRETİM MOTORU ---

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Her worker'ın kendi logu
let workerLogs = {
    1: 'Deneme 1: Henüz çalıştırılmadı.',
    2: 'Deneme 2: Henüz çalıştırılmadı.',
    3: 'Deneme 3: Henüz çalıştırılmadı.',
    4: 'Deneme 4: Henüz çalıştırılmadı.',
    5: 'Deneme 5: Henüz çalıştırılmadı.'
};
let systemLog = 'Sistem henüz tetiklenmedi.';
let isGenerating = false;

// 5 API key'i ortam değişkenlerinden al
function getApiKeys() {
    return [
        process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_2 || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_3 || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_4 || process.env.GEMINI_API_KEY || '',
        process.env.GEMINI_API_KEY_5 || process.env.GEMINI_API_KEY || ''
    ];
}

/**
 * TEK BİR DENEME SINAVI ÜRETEN WORKER
 * Her worker bağımsız çalışır, kendi API key'ini kullanır.
 * 20 ders boyunca döner, her ders için countPerExam kadar soru üretir (toplam 120).
 * Bittiğinde weekly_exams tablosuna direkt yazar.
 */
async function generateSingleExam(examNumber, apiKey) {
    const logPrefix = `[Deneme ${examNumber}]`;
    workerLogs[examNumber] = `${logPrefix} [${new Date().toISOString()}] Başlatıldı (Key: ...${apiKey.slice(-6)})\n`;

    let examQuestions = [];
    
    // Dersleri ~30 soruluk küçük paketlere (batch) bölelim
    // (Büyük paketler sorulduğunda Google API zaman aşımına (Timeout) uğruyordu)
    const batches = [];
    // Ders listesini (20 ders) tam olarak 5'er derslik 4 gruba bölüyoruz.
    for (let i = 0; i < subjects.length; i += 5) {
        const chunk = subjects.slice(i, i + 5).map(s => ({
            name: s.name,
            count: s.countPerExam
        }));
        batches.push(chunk);
    }

    // batches değişkeni artık 4 parçaya (27, 33, 33, 27 soruluk) bölünmüş olacak
    for (const [index, batch] of batches.entries()) {

        workerLogs[examNumber] += `${logPrefix} Batch ${index + 1} başlatılıyor (${batch.length} ders)...\n`;
        
        let retries = 0;
        let success = false;

        while (!success && retries < 3) {
            try {
                const questions = await askAIForBatchQuestions(batch, apiKey);
                if (questions && questions.length > 0) {
                    examQuestions = examQuestions.concat(questions);
                    workerLogs[examNumber] += `  ✅ Batch ${index + 1}: ${questions.length} soru alındı.\n`;
                    success = true;
                } else {
                    retries++;
                    workerLogs[examNumber] += `  ⚠️ Batch ${index + 1} boş yanıt, tekrar deneniyor (${retries}/3)...\n`;
                }
            } catch (e) {
                retries++;
                workerLogs[examNumber] += `  ❌ Batch ${index + 1} Hatası: ${e.message.substring(0, 100)} (${retries}/3)\n`;
            }

            if (!success && retries < 3) {
                await sleep(15000); // Hata sonrası 15 sn bekle
            }
        }

        // Batchler arası kısa mola
        if (index === 0) await sleep(10000);
    }

    // Soruları karıştır
    examQuestions = examQuestions.sort(() => Math.random() - 0.5);

    // Supabase'e yaz
    if (examQuestions.length >= 50) {
        const weekStart = new Date().toISOString().split('T')[0];
        const weekNumber = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));

        // Önce bu denemenin eski kaydını sil
        await supabase.from('weekly_exams')
            .delete()
            .eq('exam_number', examNumber)
            .eq('week_number', weekNumber);

        // Yeni sınavı yaz
        const { error } = await supabase.from('weekly_exams').insert({
            week_number: weekNumber,
            exam_number: examNumber,
            week_start: weekStart,
            questions_json: examQuestions
        });

        if (error) {
            workerLogs[examNumber] += `${logPrefix} ❌ Supabase yazma hatası: ${error.message}\n`;
        } else {
            workerLogs[examNumber] += `\n${logPrefix} 🎉 TAMAMLANDI! ${examQuestions.length} soru Supabase'e yazıldı.\n`;
        }

        // Soruları ayrıca questions tablosuna da ekle (flashcard vs. için)
        const { error: qErr } = await supabase.from('questions').insert(examQuestions);
        if (qErr) {
            workerLogs[examNumber] += `${logPrefix} ⚠️ Questions tablosu yazma uyarısı: ${qErr.message}\n`;
        }
    } else {
        workerLogs[examNumber] += `\n${logPrefix} ❌ Yetersiz soru (${examQuestions.length}). Kayıt yapılmadı.\n`;
    }

    return { examNumber, questionCount: examQuestions.length, failures: 0 };
}

/**
 * ANA ORKESTRATÖR: 5 worker'ı paralel başlatır.
 */
async function generateAllExamsParallel() {
    if (isGenerating) {
        systemLog += `\n[${new Date().toISOString()}] UYARI: Zaten bir üretim işlemi devam ediyor.\n`;
        return;
    }

    isGenerating = true;
    systemLog = `[${new Date().toISOString()}] 🚀 ÜRETİM BAŞLATILDI (5 Worker x 120 Soru)\n`;

    const apiKeys = getApiKeys();

    // Eski soruları temizle
    systemLog += `[${new Date().toISOString()}] Eski sorular temizleniyor...\n`;
    await supabase.from('questions').delete().neq('id', 0);

    // 5 worker'ı SIRALI başlat (her biri farklı Google projesinin key'ini kullanarak IP banını önlüyor)

    try {
        const results = [];
        for (let i = 1; i <= 5; i++) {
            const key = apiKeys[i - 1];
            if (!key) {
                workerLogs[i] = `[Deneme ${i}] ❌ API key bulunamadı! GEMINI_API_KEY_${i} tanımlı değil.\n`;
                systemLog += `[Worker ${i}] ❌ API key eksik, atlanıyor.\n`;
                continue;
            }
            
            systemLog += `[Worker ${i}] ▶️ İşleme başlıyor (Key: ...${key.slice(-6)})\n`;
            
            try {
                const r = await generateSingleExam(i, key);
                results.push({ status: 'fulfilled', value: r });
                systemLog += `[Worker ${i}] ✅ BAŞARILI: ${r.questionCount} soru.\n`;
            } catch (err) {
                results.push({ status: 'rejected', reason: err });
                systemLog += `[Worker ${i}] ❌ KRİTİK HATA: ${err.message}\n`;
            }

            // Diğer denemeye geçmeden önce IP kotasını (RPM) soğutmak için 1 DAKİKA mola
            if (i < 5) {
                systemLog += `[SİSTEM] Diğer denemeye geçmeden önce 60 sn mola (IP Ban Koruması)...\n`;
                await sleep(60000);
            }
        }

        systemLog += `\n[${new Date().toISOString()}] ===== FİNAL RAPORU =====\n`;
        results.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
                const r = result.value;
                systemLog += `  Deneme ${r.examNumber}: ✅ ${r.questionCount} soru\n`;
            } else {
                systemLog += `  Worker ${idx + 1}: ❌ Başarısız: ${result.reason?.message || 'Bilinmeyen'}\n`;
            }
        });

        systemLog += `\n[${new Date().toISOString()}] 🏁 TÜM SÜREÇ TAMAMLANDI.\n`;
    } catch (e) {
        systemLog += `\n[SİSTEM HATASI]: ${e.message}\n`;
    } finally {
        isGenerating = false;
    }
}

// 1. OTOMATİK SİSTEM: Her Pazar gecesi saat 03:00'te çalışır.
cron.schedule('0 3 * * 0', async () => {
    console.log("Zamanlayıcı tetiklendi: Haftalık Paralel Soru Üretimi");
    await generateAllExamsParallel();
});

// 2. MANUEL TETİKLEME
app.all('/api/admin/generate-questions', (req, res) => {
    const adminPassword = req.body?.password || req.query?.password;
    if (adminPassword !== 'avuka2026') return res.status(401).json({ error: "Geçersiz şifre" });

    generateAllExamsParallel().catch(e => console.error(e));

    res.json({ 
        message: '🚀 5 Worker başlatıldı! Her biri bağımsız çalışıyor.',
        logLinks: {
            genel: '/api/admin/logs',
            deneme1: '/api/admin/logs/1',
            deneme2: '/api/admin/logs/2',
            deneme3: '/api/admin/logs/3',
            deneme4: '/api/admin/logs/4',
            deneme5: '/api/admin/logs/5'
        }
    });
});

// 3. LOG ENDPOINTLERİ
app.get('/api/admin/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    let fullLog = systemLog + '\n\n';
    for (let i = 1; i <= 5; i++) {
        fullLog += `========== DENEME ${i} ==========\n${workerLogs[i]}\n\n`;
    }
    res.send(fullLog);
});

app.get('/api/admin/logs/:examNum', (req, res) => {
    const num = parseInt(req.params.examNum);
    if (num < 1 || num > 5) return res.status(400).json({ error: 'Geçersiz deneme numarası (1-5)' });
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.send(workerLogs[num]);
});

// --- ÇIKMIŞ SORULAR API ---

app.get('/api/past-questions', async (req, res) => {
    try {
        const { year, exam_type, subject } = req.query;
        let query = supabase.from('past_questions').select('*');
        
        if (year) query = query.eq('year', year);
        if (exam_type) query = query.eq('exam_type', exam_type);
        if (subject) query = query.eq('subject', subject);
        
        const { data, error } = await query.order('year', { ascending: false });
        if (error) throw error;
        
        res.json(data);
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/admin/past-questions', async (req, res) => {
    const { password, questions } = req.body;
    if (password !== 'avuka2026') return res.status(401).json({ error: "Yetkisiz" });
    
    try {
        const { data, error } = await supabase.from('past_questions').insert(questions.map(q => ({
            year: q.year,
            exam_type: q.exam_type,
            subject: q.subject,
            question_text: q.question_text,
            option_a: q.option_a,
            option_b: q.option_b,
            option_c: q.option_c,
            option_d: q.option_d,
            option_e: q.option_e,
            correct_answer: q.correct_answer,
            explanation: q.explanation,
            hap_bilgisi: q.hap_bilgisi,
            is_premium: q.is_premium !== undefined ? q.is_premium : true
        })));
        
        if (error) throw error;
        res.json({ message: `${questions.length} adet çıkmış soru eklendi.` });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Supabase-Destekli Sunucu ${PORT} portunda başarıyla çalışıyor.`);
});

