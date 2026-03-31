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
        let rawText = response.text;
        
        // Güvenlik 1: Markdown kodlarını temizle
        rawText = rawText.replace(/^```json/mi, '').replace(/```$/mi, '').replace(/```/g, '').trim();
        
        // Güvenlik 2: Gemini'nin "İşte sorularınız:" gibi sohbet (chatter) kısımlarını atla ve köşeli parantezleri ayıkla
        const firstBracket = rawText.indexOf('[');
        const lastBracket = rawText.lastIndexOf(']');
        if (firstBracket !== -1 && lastBracket !== -1) {
            rawText = rawText.substring(firstBracket, lastBracket + 1);
        }

        // Güvenlik 3: Gemini 2.5 Flash çok akıllı olduğu için paragrafları enter (newline) ile ayırıyor.
        // Ancak JSON stringi içinde raw (kaçışsız) \n veya \t karakteri olursa JSON.parse anında ÇÖKER (Bad Control Character).
        // Bunu önlemek için rawText içindeki tüm alt satır ve sekmeleri boşluğa (space) dönüştürüp tek satır (flat) yapıyoruz.
        rawText = rawText.replace(/[\n\r\t]+/g, ' ');

        // JSON parse işleminde patlamaması için ekstra boşluk temizliği
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
        throw new Error(`Gemini Hatası: ` + error.message);
    }
}

module.exports = { askAIForQuestions };
