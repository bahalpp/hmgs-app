const https = require('https');

/**
 * Gemini API'ye HTTPS isteği atar ve yanıtı döndürür.
 * Node.js dahili https modülü kullanır (fetch/SDK sorunlarından bağımsız).
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

        req.setTimeout(120000, () => { req.destroy(); reject(new Error('API zaman aşımı (120sn)')); });
        req.on('error', (e) => reject(new Error(`Bağlantı hatası: ${e.message}`)));
        req.write(body);
        req.end();
    });
}

/**
 * Ham API yanıtından JSON dizisini güvenli şekilde çıkarır.
 * - Markdown ```json bloklarını temizler
 * - Sohbet metinlerini atlar
 * - Yarıda kesilmiş JSON'ı onarır (Kurtarma Modu)
 */
function extractJSON(rawText) {
    // 1) Markdown code fence temizliği
    let text = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '');

    // 2) JSON dizisinin başlangıcını bul
    const firstBracket = text.indexOf('[');
    if (firstBracket === -1) throw new Error('Yanıtta JSON dizisi bulunamadı');

    const lastBracket = text.lastIndexOf(']');

    if (lastBracket !== -1 && lastBracket > firstBracket) {
        // Normal durum: tam JSON
        text = text.substring(firstBracket, lastBracket + 1);
    } else {
        // Kurtarma Modu: Yarıda kesilmiş JSON'ı onar
        const lastBrace = text.lastIndexOf('}');
        if (lastBrace !== -1 && lastBrace > firstBracket) {
            text = text.substring(firstBracket, lastBrace + 1) + ']';
            console.log('[KURTARMA]: Yarım kalan JSON onarıldı.');
        } else {
            throw new Error('JSON onarılamadı');
        }
    }

    // 3) Kontrol karakterleri ve trailing comma temizliği
    text = text.replace(/[\n\r\t]+/g, ' ').trim();
    text = text.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');

    return JSON.parse(text);
}

async function askAIForQuestions(subjectName, requestedCount = 15) {
    if (!process.env.GEMINI_API_KEY) {
        console.error('GEMINI_API_KEY eksik!');
        return [];
    }

    console.log(`AI: "${subjectName}" için ${requestedCount} soru isteniyor...`);

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

    const raw = await geminiRequest(payload, process.env.GEMINI_API_KEY);
    const apiResponse = JSON.parse(raw);

    if (!apiResponse.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error('API boş/geçersiz yanıt döndürdü');
    }

    const questions = extractJSON(apiResponse.candidates[0].content.parts[0].text);

    if (!Array.isArray(questions) || questions.length === 0) {
        throw new Error('Soru dizisi boş veya geçersiz');
    }

    return questions.map(q => [
        q.subject || subjectName,
        q.question, q.optA, q.optB, q.optC, q.optD, q.optE,
        q.correct, q.explanation, q.topicSummary
    ]);
}

module.exports = { askAIForQuestions };
