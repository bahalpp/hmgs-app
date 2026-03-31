const { GoogleGenAI } = require('@google/genai');

async function askAIForQuestions(subjectName, requestedCount = 25) {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY eksik! Üretim atlanıyor...");
        return [];
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `
Sen Türkiye HMGS (Hukuk Mesleklerine Giriş Sınavı) seviyesinde soru hazırlayan, ÖSYM mantığını ve son yargı kararlarını çok iyi bilen bir HUKUK PROFESÖRÜSÜN.
Ders: "${subjectName}". 

SENDEN İSTENEN: Bu ders konusu üzerine tam olarak ${requestedCount} adet, birbirinden farklı, özgün ve yüksek kaliteli çoktan seçmeli (A, B, C, D, E) soru oluşturman.

SORU KALİTESİ KURALLARI:
1. Soruların en az %70'i "OLAY SORUSU" (Vaka analizi) formatında olmalıdır. (Örn: "A, B'ye şu tarihte şu vaatte bulunmuştur...")
2. Analitik düşünme gerektiren, sadece ezberle çözülemeyecek, karmaşık hukuki ilişkileri sorgulayan sorular hazırla.
3. Çeldirici şıklar (Distractors) çok kuvvetli olmalı; öğrenciyi gerçek sınavdaki gibi terletmelidir.
4. Her sorunun "explanation" kısmında, o cevabın neden doğru olduğunu ilgili Kanun Maddesine (TMK, HMK, TCK vb.) atıf yaparak teknik bir dille açıkla.
5. "topicSummary" kısmında, o soruyla ilgili unutulmaması gereken kritik "Hap Bilgi"yi yaz.

TEKNİK FORMAT KURALLARI:
- Cevabın YALNIZCA geçerli bir JSON array formatında olmalı. 
- Asla başına veya sonuna markdown sembolleri (\`\`\`json) koyma. Sohbet kısımları ekleme.
- JSON objesi şu anahtarları içermelidir: "subject", "question", "optA", "optB", "optC", "optD", "optE", "correct", "explanation", "topicSummary".
`;

    try {
        console.log(`AI (1.5 Pro): "${subjectName}" dersi için ${requestedCount} adet akademik soru yazılıyor...`);
        
        // Bu SDK sürümü için model seçimi bu şekilde yapılmalıdır:
        const response = await ai.models.generateContent({
            model: 'gemini-1.5-pro',
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                temperature: 0.8,
                responseMimeType: "application/json"
            }
        });
        
        // Gelen yanıtın içindeki metni alalım
        let rawText = response.text;
        
        // Güvenlik: JSON dışındaki her şeyi ayıkla
        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            rawText = rawText.substring(firstBracket, lastBracket + 1);
        }

        // Güvenlik: Kontrol karakterlerini temizle
        rawText = rawText.replace(/[\n\r\t]+/g, ' ').trim();

        let questionsJson;
        try {
            questionsJson = JSON.parse(rawText);
        } catch (initialError) {
            try {
                const cleanedText = rawText.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');
                questionsJson = JSON.parse(cleanedText);
            } catch (secondError) {
                throw new Error(`JSON Format Hatası (Temizlenemedi): ${initialError.message}`);
            }
        }
        
        if (!Array.isArray(questionsJson)) {
            throw new Error("Üretilen veri bir dizi formatında değil.");
        }

        const dbFormat = questionsJson.map(q => [
            q.subject || subjectName,
            q.question,
            q.optA,
            q.optB,
            q.optC,
            q.optD,
            q.optE,
            q.correct,
            q.explanation,
            q.topicSummary
        ]);
        
        console.log(`AI BAŞARILI: "${subjectName}" için ${dbFormat.length} soru alındı.`);
        return dbFormat;
    } catch (error) {
        throw new Error(`Gemini 1.5 Pro Hatası: ` + error.message);
    }
}

module.exports = { askAIForQuestions };
