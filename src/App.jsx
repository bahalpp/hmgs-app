import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Timer, BookOpen, User, Flame, ArrowRight, CheckCircle2, XCircle, ChevronRight, Play, Pause, RotateCcw, Clock, Trophy, Target, Calendar, BookMarked, ChevronDown, Layers } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export default function App() {
  const [view, setView] = useState('dashboard');
  const [weeklyData, setWeeklyData] = useState(null);
  const [selectedExam, setSelectedExam] = useState(null);
  const [examResults, setExamResults] = useState(null);
  const [studyTime, setStudyTime] = useState(() => parseInt(localStorage.getItem('studyTime') || '0'));
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [streak, setStreak] = useState(() => parseInt(localStorage.getItem('streak') || '1'));
  const [pastResults, setPastResults] = useState(() => JSON.parse(localStorage.getItem('pastResults') || '[]'));
  
  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [showInstallPrompt, setShowInstallPrompt] = useState(() => localStorage.getItem('hideInstall') !== 'true');

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsStandalone(true);
    }
    const ua = window.navigator.userAgent;
    const isIOSDevice = !!ua.match(/iPad/i) || !!ua.match(/iPhone/i);
    const webkit = !!ua.match(/WebKit/i);
    if (isIOSDevice && webkit && !ua.match(/CriOS/i)) setIsIOS(true);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setDeferredPrompt(null);
    }
  };
  
  const dismissInstall = () => {
    setShowInstallPrompt(false);
    localStorage.setItem('hideInstall', 'true');
  };

  useEffect(() => { localStorage.setItem('studyTime', studyTime); }, [studyTime]);
  useEffect(() => { localStorage.setItem('streak', streak); }, [streak]);
  useEffect(() => { localStorage.setItem('pastResults', JSON.stringify(pastResults.slice(0, 10))); }, [pastResults]);

  useEffect(() => {
    let iv; if (isTimerRunning) iv = setInterval(() => setStudyTime(p => p + 1), 1000);
    return () => clearInterval(iv);
  }, [isTimerRunning]);

  const loadWeekly = useCallback(async () => {
    try {
      const r = await fetch(`${API}/weekly-exams`);
      const d = await r.json();
      setWeeklyData(d);
      localStorage.setItem('weeklyExams', JSON.stringify(d));
    } catch { setWeeklyData(JSON.parse(localStorage.getItem('weeklyExams') || 'null')); }
  }, []);

  useEffect(() => { loadWeekly(); }, [loadWeekly]);

  const fmt = s => { const m = Math.floor(s / 60), sec = s % 60; return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`; };
  const fmtH = s => { const h = Math.floor(s/3600), m = Math.floor((s%3600)/60); return h > 0 ? `${h}sa ${m}dk` : `${m}dk`; };

  const daysToExam = Math.max(0, Math.ceil((new Date('2026-04-26') - new Date()) / 86400000));
  const nextMonday = (() => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); return d; })();
  const countdownH = Math.max(0, Math.ceil((nextMonday - new Date()) / 3600000));

  const startExam = (exam) => { setSelectedExam(exam); setView('quiz'); };

  const finishExam = (results) => {
    setExamResults(results);
    const entry = { ...results, date: new Date().toISOString(), examNumber: selectedExam.examNumber };
    setPastResults(prev => [entry, ...prev]);
    fetch(`${API}/results`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({
      examId: selectedExam.id, score: results.score, correctCount: results.correct,
      wrongCount: results.wrong, blankCount: results.blank, totalTime: results.time, answers: results.answers
    })}).catch(()=>{});
    setView('results');
  };

  return (
    <div className="app-container">
      {view === 'dashboard' && <Dashboard {...{studyTime,isTimerRunning,setIsTimerRunning,setStudyTime,streak,fmt,fmtH,daysToExam,countdownH,weeklyData,startExam,setView}} />}
      {view === 'exams' && <ExamList exams={weeklyData?.exams} onStart={startExam} onBack={() => setView('dashboard')} />}
      {view === 'quiz' && <QuizView exam={selectedExam} onFinish={finishExam} onExit={() => setView('dashboard')} fmt={fmt} />}
      {view === 'results' && <ResultsView results={examResults} onBack={() => setView('dashboard')} onReview={() => setView('review')} />}
      {view === 'review' && <ReviewView results={examResults} onBack={() => setView('results')} />}
      {view === 'stats' && <StatsView pastResults={pastResults} onBack={() => setView('dashboard')} />}
      {view === 'pomodoro' && <PomodoroView onBack={() => setView('dashboard')} />}
      {view === 'flashcards' && <FlashcardsView onBack={() => setView('dashboard')} />}
      {(view === 'dashboard' || view === 'exams' || view === 'stats' || view === 'pomodoro' || view === 'flashcards') && (
        <div className="bottom-nav">
          <button className={`nav-item ${view==='dashboard'?'active':''}`} onClick={()=>setView('dashboard')}><BarChart3 size={20}/>Ana Sayfa</button>
          <button className={`nav-item ${view==='exams'?'active':''}`} onClick={()=>setView('exams')}><BookOpen size={20}/>Denemeler</button>
          <button className={`nav-item ${view==='flashcards'?'active':''}`} onClick={()=>setView('flashcards')}><Layers size={20}/>Kartlar</button>
          <button className={`nav-item ${view==='pomodoro'?'active':''}`} onClick={()=>setView('pomodoro')}><Timer size={20}/>Pomodoro</button>
          <button className={`nav-item ${view==='stats'?'active':''}`} onClick={()=>setView('stats')}><User size={20}/>İstatistik</button>
        </div>
      )}

      {/* PWA Yükleme Afişi */}
      {!isStandalone && showInstallPrompt && (
        <div className="animate-fade" style={{position:'fixed', bottom: 82, left: 16, right: 16, margin: '0 auto', width: 'calc(100% - 32px)', maxWidth: 400, background: 'var(--primary)', color: 'white', padding: 18, borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 10, zIndex: 9991, boxShadow: '0 10px 30px rgba(0,0,0,0.3)', alignItems: 'center', boxSizing: 'border-box'}}>
          <div style={{fontWeight: 600, fontSize: '1rem'}}>📱 Uygulamayı Yükle!</div>
          <div style={{fontSize: '0.85rem', textAlign: 'center', opacity: 0.95}}>
            {isIOS ? 
              <>iPhone'a indirmek için alttaki <b>Paylaş</b> ikonuna dokunup <br/> <b>"Ana Ekrana Ekle"</b> seçeneğini seçin.</> 
              : 
              deferredPrompt ?
              <>Hızlı ve internetsiz erişim için uygulamayı <br/>telefonunuza kurun.</>
              :
              <>Uygulamayı yüklemek için tarayıcı menüsünden (üç nokta) <br/><b>"Uygulamayı Yükle"</b> veya <b>"Ana Ekrana Ekle"</b> seçeneğini seçin.</>
            }
          </div>
          {!isIOS && deferredPrompt && <button style={{background: 'white', color: 'var(--primary)', padding: '10px 24px', borderRadius: 8, fontWeight: 700, border: 'none', cursor: 'pointer', marginTop: 6, fontSize: '0.9rem'}} onClick={handleInstallClick}>Hemen Yükle</button>}
          <button style={{position:'absolute', top: 5, right: 10, background:'none', border:'none', color:'white', fontSize:'1.4rem', cursor:'pointer', opacity: 0.8}} onClick={dismissInstall}>✕</button>
        </div>
      )}
    </div>
  );
}

// =================== DASHBOARD ===================
function Dashboard({studyTime,isTimerRunning,setIsTimerRunning,setStudyTime,streak,fmt,fmtH,daysToExam,countdownH,weeklyData,startExam,setView}) {
  return (
    <div className="animate-fade">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24}}>
        <div><p style={{margin:0,fontSize:'0.85rem'}}>Hoş geldin 👋</p><h1>HMGS Hazırlık</h1></div>
        <div className="streak-badge"><Flame size={15}/>🔥 {streak} Gün</div>
      </div>

      <div className="card">
        <h2 style={{display:'flex',alignItems:'center',gap:8}}><Clock size={18} color="var(--primary)"/>Bugünkü Çalışma</h2>
        <div className="timer-display">{fmt(studyTime)}</div>
        <div style={{display:'flex',gap:10,justifyContent:'center'}}>
          <button className="btn btn-primary" onClick={()=>setIsTimerRunning(!isTimerRunning)}>
            {isTimerRunning ? <><Pause size={16}/>Durdur</> : <><Play size={16}/>Başlat</>}
          </button>
          <button className="btn btn-secondary" onClick={()=>{setIsTimerRunning(false);setStudyTime(0)}}><RotateCcw size={16}/>Sıfırla</button>
        </div>
      </div>

      <div className="card" style={{background:'linear-gradient(135deg,#eef2ff,#e0e7ff)',border:'1px solid #c7d2fe'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div><h2 style={{color:'var(--primary)'}}>📝 Haftalık Denemeler</h2><p>5 Deneme • Her Dersten 5 Soru</p></div>
          <div className="countdown-chip">⏳ {Math.floor(countdownH/24)}g {countdownH%24}s</div>
        </div>
        <button className="btn btn-primary" style={{width:'100%',marginTop:16}} onClick={()=>setView('exams')}>
          Denemelere Git <ArrowRight size={16}/>
        </button>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr',gap:12}}>
        <div className="stat-card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'16px 20px',borderLeft:'4px solid var(--gold)'}}>
           <div style={{display:'flex',alignItems:'center',gap:12}}>
             <Calendar size={28} color="var(--gold)"/>
             <div style={{textAlign:'left'}}>
               <div style={{fontWeight:700,fontSize:'1.05rem',color:'var(--text)'}}>2026 HMGS</div>
               <div className="stat-label" style={{marginTop:0}}>Sınava Kalan Gün</div>
             </div>
           </div>
           <div className="stat-value" style={{fontSize:'2rem',color:'var(--gold)'}}>{daysToExam}</div>
        </div>
      </div>
    </div>
  );
}

// =================== FLASHCARDS ===================
function FlashcardsView({ onBack }) {
  const [cards, setCards] = useState([]);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    fetch(`${API}/flashcards`).then(r => r.json()).then(setCards).catch(()=>{});
  }, []);

  if (cards.length === 0) return <div className="animate-fade"><h2>Kartlar yükleniyor...</h2></div>;

  const nextCard = () => {
    setFlipped(false);
    setTimeout(() => {
      setIdx((prev) => (prev + 1) % cards.length);
    }, 200);
  };

  const card = cards[idx];

  return (
    <div className="animate-fade">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="btn btn-secondary" style={{padding:'8px 12px'}} onClick={onBack}>←</button>
        <h1>Hafıza Kartları</h1>
      </div>
      
      <div className="flashcard-container" onClick={() => setFlipped(!flipped)}>
        <div className={`flashcard ${flipped ? 'flipped' : ''}`}>
          <div className="flashcard-front card">
            <div className="subject-tag" style={{marginBottom:16, alignSelf:'flex-start'}}>{card.subject}</div>
            <h2 style={{fontSize:'1.1rem',lineHeight:1.6,fontWeight:500,marginTop:10}}>{card.front}</h2>
            <div style={{marginTop:'auto',color:'var(--text-muted)',fontSize:'0.85rem',display:'flex',justifyContent:'center',alignItems:'center',gap:6,paddingTop:20}}>
              <RotateCcw size={16}/> Çevirmek için dokun
            </div>
          </div>
          <div className="flashcard-back card" style={{padding:0, overflow:'hidden'}}>
            <div style={{background:'var(--success)',padding:'16px',color:'#fff'}}>
              <div style={{fontSize:'0.75rem',fontWeight:800,letterSpacing:1,marginBottom:4}}>DOĞRU CEVAP</div>
              <div style={{fontSize:'1rem',fontWeight:600}}>{card.answer}</div>
            </div>
            <div className="hap-bilgi" style={{margin:0,flex:1,overflowY:'auto',borderRadius:0,border:'none',background:'var(--bg-white)',padding:'20px 16px',boxShadow:'none'}}>
               <div className="hap-bilgi-title" style={{color:'var(--primary)'}}><Flame size={14} color="var(--primary)"/> HAP BİLGİ</div>
               <p style={{fontSize:'0.9rem',color:'var(--text)',lineHeight:1.7}}>{card.summary}</p>
            </div>
          </div>
        </div>
      </div>
      
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:24}}>
        <div style={{fontSize:'0.9rem',color:'var(--text-muted)',fontWeight:600}}>{idx+1} / {cards.length}</div>
        <button className="btn btn-primary" onClick={nextCard} style={{width:'60%'}}>Sonraki Kart →</button>
      </div>
    </div>
  );
}

// =================== DİĞER GÖRÜNÜMLER ===================
// =================== POMODORO ===================
function PomodoroView({ onBack }) {
  const [mode, setMode] = useState('work'); // 'work' | 'break' | 'longBreak'
  const [timeLeft, setTimeLeft] = useState(25 * 60);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    let t;
    if (isRunning && timeLeft > 0) t = setInterval(() => setTimeLeft(p => p - 1), 1000);
    else if (timeLeft === 0 && isRunning) setIsRunning(false);
    return () => clearInterval(t);
  }, [isRunning, timeLeft]);

  const switchMode = (m) => {
    setMode(m);
    if (m === 'work') setTimeLeft(25 * 60);
    else if (m === 'break') setTimeLeft(5 * 60);
    else if (m === 'longBreak') setTimeLeft(15 * 60);
    setIsRunning(false);
  };

  const fmt = s => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  return (
    <div className="animate-fade">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:24}}>
        <button className="btn btn-secondary" style={{padding:'8px 12px'}} onClick={onBack}>←</button>
        <h1>Pomodoro Odaklanma</h1>
      </div>

      <div className="card" style={{textAlign:'center',padding:'40px 20px',background:'linear-gradient(135deg, var(--primary-light), #ffffff)'}}>
        <div style={{display:'flex',justifyContent:'center',gap:8,marginBottom:30,flexWrap:'wrap'}}>
          <button className={`btn ${mode==='work'?'btn-primary':'btn-secondary'}`} style={{padding:'8px 12px'}} onClick={()=>switchMode('work')}>Çalışma (25dk)</button>
          <button className={`btn ${mode==='break'?'btn-primary':'btn-secondary'}`} style={{padding:'8px 12px'}} onClick={()=>switchMode('break')}>Mola (5dk)</button>
          <button className={`btn ${mode==='longBreak'?'btn-primary':'btn-secondary'}`} style={{padding:'8px 12px'}} onClick={()=>switchMode('longBreak')}>Uzun Mola (15dk)</button>
        </div>

        <div style={{fontSize:'4.5rem',fontWeight:800,color:'var(--primary)',lineHeight:1,marginBottom:30,fontVariantNumeric:'tabular-nums'}}>
          {fmt(timeLeft)}
        </div>

        <div style={{display:'flex',justifyContent:'center',gap:12}}>
          <button className="btn btn-primary" style={{width:120}} onClick={()=>setIsRunning(!isRunning)}>
            {isRunning ? <><Pause size={18}/> Beklet</> : <><Play size={18}/> Başla</>}
          </button>
          <button className="btn btn-secondary" style={{width:120}} onClick={()=>{setIsRunning(false);switchMode(mode);}}>
            <RotateCcw size={18}/> Sıfırla
          </button>
        </div>
      </div>
      <p style={{textAlign:'center',color:'var(--text-muted)',fontSize:'0.85rem',marginTop:20}}>Pomodoro tekniği ile 25 dk odaklanıp 5 dk mola vererek verimliliğinizi artırabilirsiniz.</p>
    </div>
  );
}

// =================== EXAM LIST ===================
function ExamList({ exams, onStart, onBack }) {
  if (!exams || exams.length === 0) return <div className="animate-fade"><h2>Denemeler yükleniyor...</h2></div>;
  return (
    <div className="animate-fade">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="btn btn-secondary" style={{padding:'8px 12px'}} onClick={onBack}>←</button>
        <h1>Haftalık Denemeler</h1>
      </div>
      <p style={{marginBottom:16}}>Her deneme tüm derslerden 5'er soru içerir. Haftada 5 deneme çözebilirsiniz.</p>
      {exams.map((exam, i) => (
        <div key={exam.id} className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={() => onStart(exam)}>
          <div style={{display:'flex',alignItems:'center',gap:14}}>
            <div style={{width:44,height:44,borderRadius:12,background:'var(--primary-light)',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color:'var(--primary)',fontSize:'1.1rem'}}>{i+1}</div>
            <div><div style={{fontWeight:600}}>Deneme {i+1}</div><p style={{margin:0,fontSize:'0.8rem'}}>{exam.questions.length} Soru</p></div>
          </div>
          <ChevronRight size={18} color="var(--text-muted)"/>
        </div>
      ))}
    </div>
  );
}

// =================== QUIZ ===================
function QuizView({ exam, onFinish, onExit, fmt }) {
  const qs = exam?.questions || [];
  const [idx, setIdx] = useState(0);
  const [ans, setAns] = useState({});
  const [time, setTime] = useState(qs.length * 72); // ~1.2 dk/soru

  useEffect(() => { const t = setInterval(() => setTime(p => { if (p <= 0) return 0; return p-1; }), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (time === 0 && qs.length > 0) finish(); }, [time]);

  const finish = () => {
    const results = qs.map((q, i) => ({ ...q, userAnswer: ans[i] || null, isCorrect: ans[i] === q.correct_answer }));
    const correct = results.filter(r => r.isCorrect).length;
    const blank = results.filter(r => !r.userAnswer).length;
    onFinish({ questions: results, correct, wrong: qs.length - correct - blank, blank, score: Math.round((correct / qs.length) * 100), time: (qs.length * 72) - time, answers: ans });
  };

  if (qs.length === 0) return <div className="animate-fade"><h2>Sorular yükleniyor...</h2></div>;
  const q = qs[idx];

  return (
    <div className="animate-fade">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 0',marginBottom:12,borderBottom:'1px solid var(--border)'}}>
        <button className="btn btn-secondary" style={{padding:'6px 10px',fontSize:'0.8rem'}} onClick={onExit}>✕ Çık</button>
        <div className="countdown-chip">{fmt(time)}</div>
        <span style={{fontSize:'0.8rem',fontWeight:600,color:'var(--text-secondary)'}}>{idx+1}/{qs.length}</span>
      </div>

      <div className="subject-tag">{q.subject}</div>
      <h2 style={{marginTop:10,fontSize:'1rem',fontWeight:500,lineHeight:1.6,marginBottom:20}}>{q.question_text}</h2>

      {['A','B','C','D','E'].map(o => (
        <button key={o} className={`option-btn ${ans[idx]===o?'selected':''}`} onClick={()=>setAns({...ans,[idx]:o})}>
          <div className={`option-letter ${ans[idx]===o?'selected':''}`}>{o}</div>
          <span>{q[`option_${o.toLowerCase()}`]}</span>
        </button>
      ))}

      <div style={{display:'flex',gap:10,marginTop:20}}>
        <button className="btn btn-secondary" style={{flex:1}} disabled={idx===0} onClick={()=>setIdx(idx-1)}>← Geri</button>
        <button className="btn btn-secondary" style={{flex:1,color:'var(--error)',borderColor:'var(--error)'}} onClick={finish}>Bitir</button>
        {idx < qs.length-1 && <button className="btn btn-primary" style={{flex:1}} onClick={()=>setIdx(idx+1)}>Sonraki →</button>}
      </div>

      {/* Soru navigasyonu */}
      <div style={{display:'flex',flexWrap:'wrap',gap:6,marginTop:20,justifyContent:'center'}}>
        {qs.map((_,i) => (
          <button key={i} onClick={()=>setIdx(i)} style={{width:32,height:32,borderRadius:8,border: i===idx ? '2px solid var(--primary)' : '1px solid var(--border)', background: ans[i] ? 'var(--primary-light)' : 'var(--bg-white)', color: ans[i] ? 'var(--primary)' : 'var(--text-muted)', fontWeight:600,fontSize:'0.75rem',cursor:'pointer'}}>{i+1}</button>
        ))}
      </div>
    </div>
  );
}

// =================== RESULTS ===================
function ResultsView({ results, onBack, onReview }) {
  if (!results) return null;
  const { correct, wrong, blank, score, questions } = results;
  return (
    <div className="animate-fade">
      <div className="card" style={{textAlign:'center',padding:32}}>
        <Trophy size={48} color="var(--gold)" style={{marginBottom:12}}/>
        <h1>Sınav Tamamlandı!</h1>
        <div style={{width:130,height:130,margin:'20px auto',position:'relative'}}>
          <svg viewBox="0 0 36 36" style={{width:'100%',height:'100%',transform:'rotate(-90deg)'}}>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--border)" strokeWidth="3"/>
            <circle cx="18" cy="18" r="15.9" fill="none" stroke={score>=70?'var(--success)':'var(--error)'} strokeWidth="3" strokeDasharray={`${score} ${100-score}`} strokeLinecap="round"/>
          </svg>
          <div style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)'}}><div style={{fontSize:'1.8rem',fontWeight:800}}>%{score}</div></div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12,marginTop:16}}>
          <div className="stat-card" style={{background:'var(--success-bg)',border:'1px solid #a7f3d0'}}><div className="stat-value" style={{color:'var(--success)'}}>{correct}</div><div className="stat-label">Doğru</div></div>
          <div className="stat-card" style={{background:'var(--error-bg)',border:'1px solid #fecaca'}}><div className="stat-value" style={{color:'var(--error)'}}>{wrong}</div><div className="stat-label">Yanlış</div></div>
          <div className="stat-card"><div className="stat-value">{blank}</div><div className="stat-label">Boş</div></div>
        </div>
      </div>
      <button className="btn btn-primary" style={{width:'100%',marginBottom:10}} onClick={onReview}><BookMarked size={16}/>Yanlışlarımı İncele</button>
      <button className="btn btn-secondary" style={{width:'100%'}} onClick={onBack}>Ana Sayfaya Dön</button>
    </div>
  );
}

// =================== REVIEW ===================
function ReviewView({ results, onBack }) {
  const [openIdx, setOpenIdx] = useState(null);
  const [filter, setFilter] = useState('all'); // all, wrong, correct
  const qs = results?.questions || [];
  const filtered = filter === 'wrong' ? qs.filter(q => !q.isCorrect && q.userAnswer) : filter === 'correct' ? qs.filter(q => q.isCorrect) : qs;

  return (
    <div className="animate-fade">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
        <button className="btn btn-secondary" style={{padding:'8px 12px'}} onClick={onBack}>←</button>
        <h1>Soru İnceleme</h1>
      </div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        {[['all','Tümü'],['wrong','Yanlışlar'],['correct','Doğrular']].map(([k,l])=>(
          <button key={k} className={`btn ${filter===k?'btn-primary':'btn-secondary'}`} style={{padding:'8px 14px',fontSize:'0.8rem'}} onClick={()=>setFilter(k)}>{l}</button>
        ))}
      </div>
      {filtered.map((q, i) => {
        const realIdx = qs.indexOf(q);
        const isOpen = openIdx === realIdx;
        return (
          <div key={realIdx} className="review-card">
            <div style={{padding:14,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}} onClick={()=>setOpenIdx(isOpen?null:realIdx)}>
              <div style={{display:'flex',alignItems:'center',gap:10,flex:1,minWidth:0}}>
                {q.isCorrect ? <CheckCircle2 size={18} color="var(--success)"/> : q.userAnswer ? <XCircle size={18} color="var(--error)"/> : <div style={{width:18,height:18,borderRadius:'50%',border:'2px solid var(--text-muted)'}}/>}
                <div style={{minWidth:0}}>
                  <div style={{fontSize:'0.72rem',color:'var(--primary)',fontWeight:700}}>{q.subject}</div>
                  <div style={{fontSize:'0.85rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{q.question_text}</div>
                </div>
              </div>
              <ChevronDown size={16} style={{transform:isOpen?'rotate(180deg)':'none',transition:'0.3s',flexShrink:0,marginLeft:8}}/>
            </div>
            {isOpen && (
              <div style={{padding:'0 14px 14px',borderTop:'1px solid var(--border)'}}>
                <div style={{margin:'12px 0'}}>
                  {['A','B','C','D','E'].map(o => {
                    const isCorrectOpt = o === q.correct_answer;
                    const isUserOpt = o === q.userAnswer;
                    let cls = '';
                    if (isCorrectOpt) cls = 'correct';
                    else if (isUserOpt && !q.isCorrect) cls = 'wrong';
                    return <div key={o} className={`option-btn ${cls}`} style={{cursor:'default',padding:'10px 12px',marginBottom:6}}>
                      <div className="option-letter" style={isCorrectOpt?{background:'var(--success)',color:'#fff',borderColor:'var(--success)'}:{}}>{o}</div>
                      <span style={{fontSize:'0.85rem'}}>{q[`option_${o.toLowerCase()}`]}</span>
                      {isCorrectOpt && <CheckCircle2 size={14} color="var(--success)" style={{marginLeft:'auto'}}/>}
                      {isUserOpt && !q.isCorrect && <XCircle size={14} color="var(--error)" style={{marginLeft:'auto'}}/>}
                    </div>;
                  })}
                </div>
                <div className="explanation-box">
                  <div style={{fontWeight:700,fontSize:'0.78rem',color:'var(--primary)',marginBottom:6}}>📖 Çözüm Açıklaması</div>
                  <p style={{fontSize:'0.85rem',color:'var(--text)',lineHeight:1.7}}>{q.explanation}</p>
                </div>
                <div className="hap-bilgi">
                  <div className="hap-bilgi-title"><Flame size={13}/>💡 HAP BİLGİ</div>
                  <p style={{fontSize:'0.83rem',color:'var(--text)',lineHeight:1.7}}>{q.topic_summary}</p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// =================== STATS ===================
function StatsView({ pastResults, onBack }) {
  return (
    <div className="animate-fade">
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20}}>
        <button className="btn btn-secondary" style={{padding:'8px 12px'}} onClick={onBack}>←</button>
        <h1>İstatistiklerim</h1>
      </div>
      {pastResults.length === 0 ? <div className="card"><p>Henüz deneme çözmediniz.</p></div> : (
        pastResults.map((r, i) => (
          <div key={i} className="card" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontWeight:600}}>Deneme {r.examNumber || i+1}</div>
              <p style={{margin:0,fontSize:'0.8rem'}}>{new Date(r.date).toLocaleDateString('tr-TR')}</p>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontWeight:800,fontSize:'1.2rem',color: r.score>=70?'var(--success)':'var(--error)'}}>%{r.score}</div>
              <p style={{margin:0,fontSize:'0.75rem'}}>{r.correct}D / {r.wrong}Y / {r.blank}B</p>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
