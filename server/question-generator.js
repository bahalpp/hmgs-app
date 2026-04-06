const { GoogleGenAI } = require('@google/genai');

async function askAIForQuestions(subjectName, requestedCount = 25) {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY eksik! Üretim atlanıyor...");
        return [];
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
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
        console.log(`AI (Gemini 2.5 Flash): "${subjectName}" için sorular yazılıyor...`);
        
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                temperature: 0.8
            }
        });
        
        let rawText = response.text;
        
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
        throw new Error(`Google GenAI SDK Hatası: ` + error.message);
    }
}

module.exports = { askAIForQuestions };
