const https = require('https');

/**
 * Gemini API'ye HTTPS isteği atar.
 * apiKey parametresi ile hangi key'in kullanılacağı belirlenir.
 */
function geminiRequest(payload, apiKey) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`);

        const req = https.request(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode !== 200) {
                    return reject(new Error(`API ${res.statusCode}: ${data.substring(0, 300)}`));
                }
                resolve(data);
            });
        });

        req.setTimeout(600000, () => { req.destroy(); reject(new Error('API zaman aşımı (600sn)')); });
        req.on('error', (e) => reject(new Error(`Bağlantı hatası: ${e.message}`)));
        req.write(body);
        req.end();
    });
}

/**
 * Ham API yanıtından JSON dizisini güvenli şekilde çıkarır.
 */
function extractJSON(rawText) {
    let text = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    const firstBracket = text.indexOf('[');
    if (firstBracket === -1) throw new Error('Yanıtta JSON dizisi bulunamadı');

    const lastBracket = text.lastIndexOf(']');

    if (lastBracket !== -1 && lastBracket > firstBracket) {
        text = text.substring(firstBracket, lastBracket + 1);
    } else {
        const lastBrace = text.lastIndexOf('}');
        if (lastBrace !== -1 && lastBrace > firstBracket) {
            text = text.substring(firstBracket, lastBrace + 1) + ']';
            console.log('[KURTARMA]: Yarım kalan JSON onarıldı.');
        } else {
            throw new Error('JSON onarılamadı');
        }
    }

    text = text.replace(/[\n\r\t]+/g, ' ').trim();
    text = text.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');

    return JSON.parse(text);
}

/**
 * Belirli bir ders için belirli sayıda soru üretir.
 * @param {string} subjectName - Ders adı
 * @param {number} requestedCount - İstenen soru sayısı
 * @param {string} apiKey - Kullanılacak Gemini API key
 */
async function askAIForQuestions(subjectName, requestedCount, apiKey) {
    if (!apiKey) {
        throw new Error('API key eksik!');
    }

    const payload = {
        contents: [{
            role: 'user',
            parts: [{ text: `Sen HMGS sınav sorusu üreten bir hukuk AI'ısın.
Ders: "${subjectName}"
${requestedCount} adet çoktan seçmeli soru üret.

Kurallar:
- %70'i olay sorusu olsun
- ÖSYM zorluğunda olsun
- explanation: doğru cevabın ilgili Kanun Maddesiyle açıklaması
- topicSummary: kısa hap bilgi

SADECE JSON dizisi döndür, başka hiçbir şey yazma.
Her obje: {"subject","question","optA","optB","optC","optD","optE","correct","explanation","topicSummary"}` }]
        }],
        generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json'
        }
    };

    const raw = await geminiRequest(payload, apiKey);
    const apiResponse = JSON.parse(raw);

    if (!apiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('API boş/geçersiz yanıt döndürdü');
    }

    const questions = extractJSON(apiResponse.candidates[0].content.parts[0].text);

    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Soru dizisi boş veya geçersiz');
    }

    return questions.map(q => ({
        subject: q.subject || subjectName,
        question_text: q.question,
        option_a: q.optA,
        option_b: q.optB,
        option_c: q.optC,
        option_d: q.optD,
        option_e: q.optE,
        correct_answer: q.correct,
        explanation: q.explanation,
        topic_summary: q.topicSummary
    }));
}

/**
 * Birden fazla ders için toplu soru üretir (Batch Mode).
 * 120 soruyu 2-3 parçada alarak API limitlerini ve token sınırlarını verimli kullanır.
 */
async function askAIForBatchQuestions(subjectList, apiKey) {
    if (!apiKey) throw new Error('API key eksik!');

    const totalRequested = subjectList.reduce((sum, s) => sum + s.count, 0);
    const subjectsDetail = subjectList.map(s => `- ${s.name}: ${s.count} soru`).join('\n');

    const payload = {
        contents: [{
            role: 'user',
            parts: [{ text: `Sen HMGS sınav sorusu üreten kıdemli bir hukuk AI'ısın. 
Aşağıdaki ders dağılımına göre toplam %${totalRequested} adet profesyonel soru üret:

${subjectsDetail}

Kurallar:
1. Her ders için TAM OLARAK istenen sayıda soru üret.
2. Soruların %70'i "olay (kurgu)" sorusu, %30'u "bilgi" sorusu olsun.
3. Zorluk derecesi: ÖSYM / Adli Yargı Hakimlik sınavı düzeyinde (Zor).
4. Her sorunun "explanation" kısmında ilgili Kanun Maddesi numarasını mutlaka belirt.
5. "topicSummary" kısmına o sorunun konusuyla ilgili unutulmaması gereken 1 cümlelik "hap bilgi" yaz.
6. "subject" alanına listedeki ders adını harfiyen yaz.

SADECE saf JSON dizisi döndür.
Obje Yapısı: {"subject","question","optA","optB","optC","optD","optE","correct","explanation","topicSummary"}` }]
        }],
        generationConfig: {
            temperature: 0.8,
            responseMimeType: 'application/json'
        }
    };

    const raw = await geminiRequest(payload, apiKey);
    const apiResponse = JSON.parse(raw);

    if (!apiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('API boş/geçersiz yanıt döndürdü');
    }

    const questions = extractJSON(apiResponse.candidates[0].content.parts[0].text);

    return questions.map(q => ({
        subject: q.subject,
        question_text: q.question,
        option_a: q.optA,
        option_b: q.optB,
        option_c: q.optC,
        option_d: q.optD,
        option_e: q.optE,
        correct_answer: q.correct,
        explanation: q.explanation,
        topic_summary: q.topicSummary
    }));
}

module.exports = { askAIForQuestions, askAIForBatchQuestions };
