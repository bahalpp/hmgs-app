async function askAIForQuestions(subjectName, requestedCount = 25) {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY eksik! Üretim atlanıyor...");
        return [];
    }

    const prompt = `
Sen Türkiye HMGS (Hukuk Mesleklerine Giriş Sınavı) seviyesinde soru hazırlayan, ÖSYM mantığını bilen bir HUKUK PROFESÖRÜSÜN.
Ders: "${subjectName}". 

SENDEN İSTENEN: Bu ders konusu üzerine tam olarak ${requestedCount} adet çoktan seçmeli (A, B, C, D, E) soru oluştur. LÜTFEN ${requestedCount} ADEDİ AŞMA (Yazı sınırına takılmamak için).

SORU KALİTESİ KURALLARI:
1. Soruların en az %70'i "OLAY SORUSU" (Vaka analizi) formatında olmalıdır.
2. Analitik düşünme gerektiren, ÖSYM zorluğunda hukuk soruları hazırla.
3. "explanation" kısmında cevabın neden doğru olduğunu ilgili Kanun Maddesiyle teknik dille açıkla.
4. "topicSummary" kısmında, o soruyla ilgili kritik "Hap Bilgi"yi yaz.

TEKNİK FORMAT KURALLARI (ÇOK ÖNEMLİ):
- Çıktın "Harika", "İşte sorular" gibi muhabbet kelimeleri İÇERMEMELİDİR.
- Doğrudan '[' ile başlayan ve ']' ile biten SAF JSON dizisi döndür.
- JSON objesi şu anahtarları içermeli: "subject", "question", "optA", "optB", "optC", "optD", "optE", "correct", "explanation", "topicSummary".
`;

    try {
        console.log(`AI (Gemini 2.5 Flash API): "${subjectName}" için sorular yazılıyor...`);
        
        const https = require('https');

        const payload = JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8 }
        });

        const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`);

        const responseData = await new Promise((resolve, reject) => {
            const req = https.request(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ status: res.statusCode, data }));
            });

            req.on('error', (e) => reject(e));
            req.write(payload);
            req.end();
        });

        if (responseData.status !== 200) {
            throw new Error(`API Hatası (Durum ${responseData.status}): ${responseData.data}`);
        }

        const data = JSON.parse(responseData.data);
        if (!data.candidates || data.candidates.length === 0) {
            throw new Error("API boş yanıt döndürdü.");
        }

        let rawText = data.candidates[0].content.parts[0].text;
        
        // HATA TOLERANSI (FAULT TOLERANCE) - Eğer API yarıda kesildiyse JSON'ı kurtar
        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        
        if (firstBracket !== -1) {
            if (lastBracket === -1 || lastBracket < firstBracket) {
                // Metin yarıda kesilmiş (Token limiti). En son bitmiş '}' süslü parantezi bulup kapat!
                const lastBrace = rawText.lastIndexOf('}');
                if (lastBrace !== -1 && lastBrace > firstBracket) {
                    rawText = rawText.substring(firstBracket, lastBrace + 1) + "\n]";
                } else {
                    rawText = rawText.substring(firstBracket) + "\n]";
                }
                console.log(`[UYARI]: API metni yarıda kesti, Json onarıldı (Kurtarma Modu Aktif).`);
            } else {
                // Normal sorunsuz kesim
                rawText = rawText.substring(firstBracket, lastBracket + 1);
            }
        }

        // Kontrol karakterlerini temizle
        rawText = rawText.replace(/[\n\r\t]+/g, ' ').trim();

        let questionsJson;
        try {
            questionsJson = JSON.parse(rawText);
        } catch (e) {
            const cleanedText = rawText.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
            questionsJson = JSON.parse(cleanedText);
        }
        
        if (!Array.isArray(questionsJson)) throw new Error("Format hatası.");

        return questionsJson.map(q => [
            q.subject || subjectName, q.question, q.optA, q.optB, q.optC, q.optD, q.optE,
            q.correct, q.explanation, q.topicSummary
        ]);
    } catch (error) {
        throw new Error(`Manuel Fetch Hatası: ` + error.message);
    }
}

module.exports = { askAIForQuestions };
