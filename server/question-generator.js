const { GoogleGenAI } = require('@google/genai');

async function askAIForQuestions(subjectName) {
    if (!process.env.GEMINI_API_KEY) {
        console.error("GEMINI_API_KEY (.env dosyasında) eksik! Lütfen Google AI Studio'dan bedava key alıp kaydedin. Üretim atlanıyor...");
        return [];
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const prompt = `
Sen Türkiye HMGS (Hukuk Mesleklerine Giriş Sınavı) seviyesinde zor soru hazırlayan, ÖSYM mantığını bilen bir hukuk profesörüsün.
Ders: "${subjectName}". 

Kurallar:
1. Bu dersten tam olarak 25 adet yeni, tamamen özgün çoktan seçmeli (A, B, C, D, E) soru oluştur.
2. Sorular ezberden ziyade analitik düşünmeyi veya örnek bir vaka (olay) çözmeyi gerektirsin. Çeldirici şıklar kuvvetli olsun.
3. Asla sadece cevap anahtarı verme, "doğru şıkkı (correct)" ve neden doğru olduğunu ilgili Kanun Maddesiyle ("explanation") mutlaka açıkla.
4. Altına kullanıcının sınavda o konuyu hatırlaması için kısa bir "Hap Bilgi" ("topicSummary") yaz.

Cevabın YALNIZCA geçerli bir JSON formatında olmalı. Asla başına veya sonuna \`\`\`json gibi markdown sembolleri veya fazladan açıklamalar KOYMA.
Örnek Format:
[
  {
    "subject": "${subjectName}",
    "question": "Soru metni...",
    "optA": "...",
    "optB": "...",
    "optC": "...",
    "optD": "...",
    "optE": "...",
    "correct": "C",
    "explanation": "Doğru cevap C'dir çünkü TMK m. XYZ'ye göre...",
    "topicSummary": "Hap Bilgi: İlgili kavramın kısa tanımı."
  }
]
`;

    try {
        console.log(`AI Bot: "${subjectName}" dersi için 5 soru yazıyor... Lütfen bekleyiniz.`);
        
        // using gemini-2.5-flash for speed, cost efficiency, and great reasoning
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                temperature: 0.7,
                responseMimeType: "application/json"
            }
        });
        
        const rawText = response.text;
        const questionsJson = JSON.parse(rawText);
        
        const dbFormat = questionsJson.map(q => [
            q.subject,
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
        
        console.log(`AI Bot: "${subjectName}" dersi için ${dbFormat.length} soru başarıyla üretildi ve formatlandı.`);
        return dbFormat;
    } catch (error) {
        console.error(`AI Bot: "${subjectName}" için soru üretirken bir hata oluştu:`, error.message);
        return [];
    }
}

module.exports = { askAIForQuestions };
