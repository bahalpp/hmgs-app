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
    "Anayasa Hukuku", "Anayasa Yargısı", "İdare Hukuku", "İdari Yargılama Hukuku",
    "Medeni Hukuk", "Borçlar Hukuku", "Ticaret Hukuku", "Hukuk Yargılama Usulü",
    "İcra ve İflas Hukuku", "Ceza Hukuku", "Ceza Yargılama Usulü", "İş Hukuku",
    "Vergi Hukuku", "Vergi Yargılama Usulü", "Avukatlık Hukuku", "Hukuk Felsefesi ve Sosyolojisi",
    "Türk Hukuk Tarihi"
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
                    subject: q.subject,
                    question_text: q.question,
                    option_a: q.options[0],
                    option_b: q.options[1],
                    option_c: q.options[2],
                    option_d: q.options[3],
                    option_e: q.options[4],
                    correct_answer: String.fromCharCode(65 + q.options.indexOf(q.answer)),
                    explanation: q.explanation,
                    topic_summary: q.topicSummary
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
