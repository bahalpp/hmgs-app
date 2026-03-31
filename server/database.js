const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';

let supabase = null;
if (!supabaseUrl || !supabaseKey) {
  console.log("UYARI: SUPABASE_URL veya SUPABASE_ANON_KEY .env dosyasında bulunamadı! (Lütfen panelden girin)");
  // Fake client to prevent total crash, although endpoints will fail until configured.
  supabase = { from: () => ({ select: () => ({}), insert: () => ({}), delete: () => ({}) })};
} else {
  supabase = createClient(supabaseUrl, supabaseKey);
}

const subjects = [
    { name: "Medeni Hukuk", countPerExam: 15 },
    { name: "Borçlar Hukuku", countPerExam: 12 },
    { name: "Ticaret Hukuku", countPerExam: 12 },
    { name: "Hukuk Yargılama Usulü", countPerExam: 12 },
    { name: "Ceza Hukuku", countPerExam: 9 },
    { name: "Anayasa Hukuku", countPerExam: 6 },
    { name: "İdare Hukuku", countPerExam: 6 },
    { name: "Ceza Yargılama Usulü", countPerExam: 6 },
    { name: "İcra ve İflas Hukuku", countPerExam: 6 },
    { name: "İş ve Sosyal Güvenlik Hukuku", countPerExam: 6 },
    { name: "Anayasa Yargısı", countPerExam: 3 },
    { name: "İdari Yargılama Usulü", countPerExam: 3 },
    { name: "Vergi Hukuku", countPerExam: 3 },
    { name: "Vergi Usul Hukuku", countPerExam: 3 },
    { name: "Avukatlık Hukuku", countPerExam: 3 },
    { name: "Hukuk Felsefesi ve Sosyolojisi", countPerExam: 3 },
    { name: "Türk Hukuk Tarihi", countPerExam: 3 },
    { name: "Milletlerarası Hukuk", countPerExam: 3 },
    { name: "Milletlerarası Özel Hukuk", countPerExam: 3 },
    { name: "Genel Kamu Hukuku", countPerExam: 3 }
];

// Seed logic: checks if questions exist in Supabase, if not, inserts seed questions.
async function initDb() {
    if (!supabaseUrl) return; // Prevent fake client from crashing
    console.log("Supabase Veritabanı Bağlantısı Kuruluyor...");
    
    try {
        const { count, error } = await supabase.from('questions').select('*', { count: 'exact', head: true });
        
        if (error) {
            console.error("Supabase'e erişilemiyor. Lütfen şifrelerinizi ve tabloyu kontrol edin:", error.message);
            return;
        }

        if (count === 0) {
            console.log("Bulut veritabanı boş. İlk 200 eski orijinal soru kalıcı olarak buluta yükleniyor...");
            try {
                const seed1 = require('./questions-seed');
                const seed2 = require('./questions-seed2');
                const seed3 = require('./questions-seed3');
                const seed4 = require('./questions-seed4');
                const seed5 = require('./questions-seed5');
                
                const allSeeds = [...seed1, ...seed2, ...seed3, ...seed4, ...seed5];
                
                const insertData = allSeeds.map(q => ({
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
                    console.error("Bulut Seed aktarma hatası:", insertError.message);
                } else {
                    console.log("200 Soru Supabase'e başarıyla çekildi!");
                }
            } catch(e) { console.error("Seed okuma/yükleme hatası", e); }
        } else {
            console.log(`BİLGİ: Supabase bulutunda şu an ${count} adet soru güvenle saklanıyor.`);
        }
    } catch(err) {
        console.error("Supabase Init Hatası:", err);
    }
}

module.exports = { supabase, initDb, subjects };
