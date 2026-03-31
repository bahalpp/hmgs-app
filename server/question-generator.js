const { GoogleGenAI } = require('@google/generative-ai');

async function askAIForQuestions(subjectName, requestedCount = 25) {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY eksik! Üretim atlanıyor...");
        return [];
    }

    // RESMÎ SDK: GoogleGenAI kullanıyoruz
    const genAI = new GoogleGenAI(process.env.GEMINI_API_KEY);
    
    const prompt = `
Sen Türkiye HMGS (Hukuk Mesleklerine Giriş Sınavı) seviyesinde soru hazırlayan, ÖSYM mantığını bilen bir HUKUK PROFESÖRÜSÜN.
Ders: "${subjectName}". 

SENDEN İSTENEN: Bu ders konusu üzerine tam olarak ${requestedCount} adet, birbirinden farklı, özgün ve yüksek kaliteli çoktan seçmeli (A, B, C, D, E) soru oluşturman.

SORU KALİTESİ KURALLARI:
1. Soruların en az %70'i "OLAY SORUSU" (Vaka analizi) formatında olmalıdır.
2. Analitik düşünme gerektiren, ÖSYM zorluğunda hukuk soruları hazırla.
3. Her sorunun "explanation" kısmında, o cevabın neden doğru olduğunu ilgili Kanun Maddesiyle teknik bir dille açıkla.
4. "topicSummary" kısmında, o soruyla ilgili unutulmaması gereken kritik "Hap Bilgi"yi yaz.

TEKNİK FORMAT KURALLARI:
- Cevabın YALNIZCA geçerli bir JSON array formatında olmalı. 
- JSON objesi şu anahtarları içermelidir: "subject", "question", "optA", "optB", "optC", "optD", "optE", "correct", "explanation", "topicSummary".
`;

    try {
        console.log(`AI (Official SDK - 1.5 Flash): "${subjectName}" için ${requestedCount} soru yazılıyor...`);
        
        // RESMÎ SYNTAX: getGenerativeModel kullanıyoruz
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.8,
                responseMimeType: "application/json"
            }
        });
        
        const response = await result.response;
        let rawText = response.text();
        
        // Güvenlik: JSON dışındaki her şeyi ayıkla
        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            rawText = rawText.substring(firstBracket, lastBracket + 1);
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
        throw new Error(`Resmî Google SDK Hatası: ` + error.message);
    }
}

module.exports = { askAIForQuestions };
