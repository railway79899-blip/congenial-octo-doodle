import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  addDoc, 
  query, 
  onSnapshot, 
  serverTimestamp,
  deleteDoc,
  getDocs
} from 'firebase/firestore';
import { 
  Zap, 
  ShieldCheck, 
  Sparkles, 
  Send, 
  Trash2, 
  User, 
  Cpu,
  RefreshCw,
  Terminal,
  AlertCircle,
  Key,
  Database,
  Eye,
  EyeOff,
  Wand2,
  CheckCircle2,
  ChevronRight,
  Terminal as TerminalIcon
} from 'lucide-react';

// --- 環境變數與 Firebase 初始化 ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-ai-app';

// 支援的模型清單
const MODELS = [
  { id: 'gemini-2.5-flash-preview-09-2025', name: 'Gemini 2.5 Flash', desc: '反應最快，適合日常對話與代碼輔助' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', desc: '邏輯最強，適合深度分析與長文本處理' }
];

const App = () => {
  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [errorStatus, setErrorStatus] = useState(null);
  
  const [myApiKey, setMyApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [apiValidStatus, setApiValidStatus] = useState('idle'); 
  const [selectedModel, setSelectedModel] = useState(MODELS[0]);
  const [temp, setTemp] = useState(0.7);

  const messagesEndRef = useRef(null);

  // 1. 初始化身份驗證 (遵守規則 3：先 Auth 再查詢)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Fail:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. 監聽 Firestore 歷史紀錄 (遵守規則 1：使用正確路徑)
  useEffect(() => {
    if (!user) return;
    
    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'chat_history');
    const q = query(historyRef);
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // 在記憶體中排序 (遵守規則 2：避免複雜查詢)
      setMessages(msgs.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0)));
    }, (err) => {
      setErrorStatus("數據庫連接異常，請檢查權限");
    });
    
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // 驗證 API 金鑰
  const validateApiKey = async () => {
    if (!myApiKey) return;
    setIsValidating(true);
    setApiValidStatus('loading');
    
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel.id}:generateContent?key=${myApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: "ping" }] }] })
      });
      
      if (res.ok) {
        setApiValidStatus('success');
        setErrorStatus(null);
      } else {
        throw new Error("金鑰無效或配額已滿");
      }
    } catch (err) {
      setApiValidStatus('error');
      setErrorStatus(err.message);
    } finally {
      setIsValidating(false);
    }
  };

  // 自動填入環境提供的 API
  const handleAutoFill = () => {
    const sysKey = typeof apiKey !== 'undefined' ? apiKey : "";
    setMyApiKey(sysKey);
    setApiValidStatus('idle');
  };

  // 送出對話
  const handleSend = async () => {
    if (!input.trim() || isTyping || apiValidStatus !== 'success' || !user) return;
    
    const userMsg = { role: 'user', content: input, timestamp: new Date().toLocaleTimeString() };
    const historyRef = collection(db, 'artifacts', appId, 'users', user.uid, 'chat_history');
    
    await addDoc(historyRef, { ...userMsg, createdAt: serverTimestamp() });
    
    const prompt = input;
    setInput('');
    setIsTyping(true);
    
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel.id}:generateContent?key=${myApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: temp }
        })
      });

      if (!res.ok) throw new Error("AI 引擎回應失敗");
      
      const data = await res.json();
      const botText = data.candidates?.[0]?.content?.parts?.[0]?.text || "無效回應";
      
      await addDoc(historyRef, {
        role: 'bot',
        content: botText,
        model: selectedModel.id,
        timestamp: new Date().toLocaleTimeString(),
        createdAt: serverTimestamp()
      });
    } catch (err) {
      setErrorStatus(err.message);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex h-screen bg-[#020203] text-slate-300 font-sans overflow-hidden">
      {/* 側邊導航 */}
      <aside className="w-80 bg-[#08080a] border-r border-white/5 flex flex-col p-6 space-y-6">
        <div className="flex items-center gap-3 px-2">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Cpu className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-black text-white tracking-widest">NEURAL CORE</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase">React Integrated System</p>
          </div>
        </div>

        {/* API 密鑰管理 */}
        <div className="bg-white/5 rounded-2xl p-4 border border-white/10 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-2">
              <Key className="w-3 h-3" /> API Key
            </span>
            <button onClick={handleAutoFill} className="text-[10px] text-blue-400 font-bold hover:underline">
              自動探測
            </button>
          </div>
          <div className="relative">
            <input 
              type={showKey ? "text" : "password"}
              value={myApiKey}
              onChange={(e) => { setMyApiKey(e.target.value); setApiValidStatus('idle'); }}
              placeholder="輸入或探測金鑰..."
              className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-xs outline-none focus:border-blue-500 transition-all"
            />
            <button onClick={() => setShowKey(!showKey)} className="absolute right-3 top-3 text-slate-600">
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <button 
            onClick={validateApiKey}
            disabled={isValidating}
            className={`w-full py-3 rounded-xl text-xs font-black transition-all ${
              apiValidStatus === 'success' ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
            }`}
          >
            {isValidating ? '系統同步中...' : apiValidStatus === 'success' ? '連線已就緒' : '建立加密連線'}
          </button>
        </div>

        {/* 模型選擇 */}
        <div className="space-y-2">
          <span className="text-[10px] font-bold text-slate-500 uppercase px-2">引擎選取</span>
          {MODELS.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedModel(m)}
              className={`w-full text-left p-4 rounded-xl border transition-all ${
                selectedModel.id === m.id ? 'bg-blue-600/10 border-blue-500 text-blue-400' : 'bg-transparent border-white/5 text-slate-500 hover:border-white/20'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">{m.name}</span>
                <ChevronRight className="w-3 h-3" />
              </div>
              <p className="text-[9px] mt-1 opacity-60 leading-tight">{m.desc}</p>
            </button>
          ))}
        </div>

        <div className="mt-auto pt-4 border-t border-white/5">
          <button 
            onClick={async () => {
              if (!user) return;
              const snap = await getDocs(collection(db, 'artifacts', appId, 'users', user.uid, 'chat_history'));
              await Promise.all(snap.docs.map(d => deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'chat_history', d.id))));
            }}
            className="w-full flex items-center justify-center gap-2 p-3 text-[10px] font-bold text-slate-600 hover:text-red-400 transition-all"
          >
            <Trash2 className="w-3 h-3" /> 清除本機對話快取
          </button>
        </div>
      </aside>

      {/* 主顯示區 */}
      <main className="flex-1 flex flex-col relative bg-gradient-to-b from-[#040406] to-[#020203]">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-black/40 backdrop-blur-xl z-20">
          <div className="flex items-center gap-3">
            <div className={`w-2 h-2 rounded-full ${apiValidStatus === 'success' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-slate-700'}`}></div>
            <h2 className="text-[11px] font-bold text-white uppercase tracking-tighter">
              Status: {apiValidStatus === 'success' ? 'Authenticated' : 'Offline'}
            </h2>
          </div>
          {errorStatus && (
            <div className="flex items-center gap-2 text-red-400 text-[10px] font-bold bg-red-400/5 px-3 py-1.5 rounded-full border border-red-400/10">
              <AlertCircle className="w-3 h-3" /> {errorStatus}
            </div>
          )}
        </header>

        {/* 聊天視窗 */}
        <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar">
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center opacity-20">
              <TerminalIcon className="w-12 h-12 text-blue-500 mb-4" />
              <p className="text-xs font-bold tracking-widest">WAITING FOR COMMANDS</p>
            </div>
          )}
          
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex gap-4 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                  msg.role === 'user' ? 'bg-blue-600' : 'bg-white/5 border border-white/10'
                }`}>
                  {msg.role === 'user' ? <User className="w-4 h-4 text-white" /> : <Sparkles className="w-4 h-4 text-blue-400" />}
                </div>
                <div className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className={`px-5 py-3 rounded-2xl text-[13px] leading-relaxed ${
                    msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-white/5 text-slate-200 rounded-tl-none border border-white/5'
                  }`}>
                    {msg.content}
                  </div>
                  <span className="text-[8px] mt-1.5 text-slate-600 font-bold uppercase">{msg.timestamp}</span>
                </div>
              </div>
            </div>
          ))}
          
          {isTyping && (
            <div className="flex gap-4 items-center">
              <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
              </div>
              <span className="text-[10px] font-bold text-blue-500 uppercase animate-pulse">Processing...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* 輸入區域 */}
        <footer className="p-8">
          <div className="max-w-3xl mx-auto flex items-end gap-3 bg-[#0d0d0f] border border-white/10 rounded-3xl p-3 shadow-2xl focus-within:border-blue-600/50 transition-all">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
              placeholder={apiValidStatus === 'success' ? "請輸入您的指令..." : "請先驗證 API 金鑰..."}
              disabled={apiValidStatus !== 'success' || isTyping}
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-4 resize-none text-white placeholder-slate-600"
              rows="1"
            />
            <button 
              onClick={handleSend}
              disabled={apiValidStatus !== 'success' || isTyping || !input.trim()}
              className="p-3 bg-blue-600 text-white rounded-2xl hover:bg-blue-500 disabled:opacity-20 transition-all shadow-lg shadow-blue-600/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </footer>
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.05); border-radius: 10px; }
      `}} />
    </div>
  );
};

export default App;
