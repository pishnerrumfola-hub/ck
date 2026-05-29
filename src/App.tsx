import React, { useState, useEffect, useRef } from "react";
import {
  BookOpen,
  CheckCircle,
  FileText,
  AlertTriangle,
  Volume2,
  Plus,
  Image as ImageIcon,
  Trash2,
  RotateCcw,
  Sparkles,
  Search,
  Check,
  ChevronRight,
  ChevronLeft,
  X,
  Play,
  Upload,
  Book,
  GraduationCap,
  HelpCircle,
  HelpCircle as HintIcon,
  RefreshCw,
  Award
} from "lucide-react";
import { VocabularyWord, WordBook, WrongWord, DictationSession } from "./types";
import { DEFAULT_WORDS } from "./defaultData";

export default function App() {
  // Navigation State
  // "library" | "dictation" | "mistakes"
  const [activeTab, setActiveTab] = useState<"library" | "dictation" | "mistakes">("library");

  // Vocabulary & Notebook States
  const [books, setBooks] = useState<WordBook[]>(() => {
    const saved = localStorage.getItem("dictation_books");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse books from localStorage:", e);
      }
    }
    return [
      {
        id: "default-book",
        name: "默认词库 (✨ 体验列表)",
        words: DEFAULT_WORDS,
        isDefault: true,
      }
    ];
  });

  const [activeBookId, setActiveBookId] = useState<string>(() => {
    const saved = localStorage.getItem("dictation_books");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed[0].id;
      } catch (e) {}
    }
    return "default-book";
  });

  // Current selected word for details viewport
  const [selectedWord, setSelectedWord] = useState<VocabularyWord | null>(() => {
    const activeBk = books.find(b => b.id === (activeBookId || "default-book"));
    return activeBk && activeBk.words.length > 0 ? activeBk.words[0] : null;
  });

  // Mistakes bank states
  const [wrongWords, setWrongWords] = useState<WrongWord[]>(() => {
    const saved = localStorage.getItem("dictation_wrong_words");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse wrong words:", e);
      }
    }
    return [];
  });

  // UI States
  const [ocrModalOpen, setOcrModalOpen] = useState(false);
  const [rawTextImportOpen, setRawTextImportOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [ocrImageBase64, setOcrImageBase64] = useState<string | null>(null);
  const [ocrPreviewUrl, setOcrPreviewUrl] = useState<string | null>(null);
  const [textImportList, setTextImportList] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [newBookName, setNewBookName] = useState("");
  const [createBookOpen, setCreateBookOpen] = useState(false);

  // Active Dictation States
  const [session, setSession] = useState<DictationSession | null>(null);
  const [userInput, setUserInput] = useState("");
  const [showPhoneticHint, setShowPhoneticHint] = useState(false);
  const [showTranslationHint, setShowTranslationHint] = useState(false);
  const [showSentenceHint, setShowSentenceHint] = useState(false);
  const [isAnswerChecked, setIsAnswerChecked] = useState(false);
  const [isLastAnswerCorrect, setIsLastAnswerCorrect] = useState(false);
  const [sessionPreferences, setSessionPreferences] = useState({
    shuffle: false,
    autoSpeak: true,
  });

  // Text-To-Speech (TTS) Engine fallback reference
  const speakWord = (wordText: string) => {
    try {
      if ("speechSynthesis" in window) {
        // Cancel first to stop overlapping audio
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(wordText);
        utterance.lang = "en-US";
        utterance.rate = 0.85; // slightly slower for dictation clarity
        window.speechSynthesis.speak(utterance);
      }
    } catch (e) {
      console.error("Speech synthesis failed:", e);
    }
  };

  // Persists books whenever they change
  useEffect(() => {
    localStorage.setItem("dictation_books", JSON.stringify(books));
  }, [books]);

  // Persists errors whenever they change
  useEffect(() => {
    localStorage.setItem("dictation_wrong_words", JSON.stringify(wrongWords));
  }, [wrongWords]);

  // Ensure selectedWord is always valid when activeBook or activeBookWords change
  useEffect(() => {
    const activeBk = books.find(b => b.id === activeBookId);
    if (activeBk && activeBk.words.length > 0) {
      // Find if we already selected a word in this book, if not default to first
      const exists = activeBk.words.find(w => w.id === selectedWord?.id);
      if (!exists) {
        setSelectedWord(activeBk.words[0]);
      }
    } else {
      setSelectedWord(null);
    }
  }, [activeBookId, books]);

  // Auto-speak word in dictation when index or session starts
  useEffect(() => {
    if (session && session.status === "running" && sessionPreferences.autoSpeak && !isAnswerChecked) {
      const currentWord = session.words[session.currentIndex];
      if (currentWord) {
        // slight timeout so the interface updates first
        const timer = setTimeout(() => {
          speakWord(currentWord.word);
        }, 300);
        return () => clearTimeout(timer);
      }
    }
  }, [session?.currentIndex, session?.status]);

  const activeBook = books.find(b => b.id === activeBookId) || books[0];

  // OCR Photo Extraction Call
  const handleOcrSubmit = async () => {
    if (!ocrImageBase64) {
      alert("请先选择或拖拽一张包含英文单词的主题图片！");
      return;
    }
    setLoading(true);
    setLoadingMessage("Gemini 3.5 AI 正在深度扫描并提取图片中的英文单词...");
    try {
      const response = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: ocrImageBase64 }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.words && Array.isArray(data.words) && data.words.length > 0) {
        // Assign IDs
        const parsedWords: VocabularyWord[] = data.words.map((w: any, idx: number) => ({
          id: `ocr-${Date.now()}-${idx}`,
          word: w.word.trim(),
          phonetic: w.phonetic,
          translation: w.translation,
          sentence: w.sentence,
          sentenceTranslation: w.sentenceTranslation,
          createdAt: Date.now(),
        }));

        // Create a new scanner book or merge into current
        const scanBookName = `📸 照片提取 (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
        const newBook: WordBook = {
          id: `book-${Date.now()}`,
          name: scanBookName,
          words: parsedWords,
        };

        setBooks(prev => [newBook, ...prev]);
        setActiveBookId(newBook.id);
        setSelectedWord(parsedWords[0]);
        setOcrModalOpen(false);
        setOcrImageBase64(null);
        setOcrPreviewUrl(null);
        alert(`成功！从图片中智能识别并提取了 ${parsedWords.length} 个核心词汇，已自动生成标准音标与语境例句！`);
      } else {
        alert("未能从图片中识别到清晰的英文单词，请尝试换一张光线明亮、字体厚度适中、边界清晰的产品说明、书页或课后单词表照片！");
      }
    } catch (error: any) {
      console.error(error);
      alert(`AI提取失败: ${error.message || "网络异常，请稍后重试"}`);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  // Text list detail compilation using Gemini
  const handleTextImportSubmit = async () => {
    const rawWords = textImportList
      .split(/[\n,，;\r]+/)
      .map(w => w.trim())
      .filter(w => w.length > 0 && /^[a-zA-Z\s\-'\d]+$/.test(w)); // English letters, digits, spaces, hyphens only

    if (rawWords.length === 0) {
      alert("请输入至少一个有效的英文单词/词组（支持多行或逗号分隔）");
      return;
    }

    setLoading(true);
    setLoadingMessage("正在联接 Gemini 系统库，为您录入单词并生成地道音标、中文释义以及双语例句...");
    try {
      const response = await fetch("/api/generate-details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ words: rawWords }),
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error);

      if (data.words && Array.isArray(data.words)) {
        const parsedWords: VocabularyWord[] = data.words.map((w: any, idx: number) => ({
          id: `import-${Date.now()}-${idx}`,
          word: w.word.trim(),
          phonetic: w.phonetic || "/暂无音标/",
          translation: w.translation || "释义待补充",
          sentence: w.sentence || "No example sentence generated.",
          sentenceTranslation: w.sentenceTranslation || "暂无例句翻译",
          createdAt: Date.now(),
        }));

        // Merge into selected active book
        setBooks(prev =>
          prev.map(b => {
            if (b.id === activeBookId) {
              return {
                ...b,
                words: [...parsedWords, ...b.words],
              };
            }
            return b;
          })
        );
        setSelectedWord(parsedWords[0]);
        setRawTextImportOpen(false);
        setTextImportList("");
        alert(`成功录入！新增 ${parsedWords.length} 个高频记忆单词。音标、词义与教学例句已一键生成完毕。`);
      }
    } catch (error: any) {
      console.error(error);
      alert(`智能生成失败: ${error.message || "请求服务器时发生未知故障"}`);
    } finally {
      setLoading(false);
      setLoadingMessage("");
    }
  };

  // Image Selection Helpers
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  const processImageFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("请确认上传的是图片文件 (png/jpg/jpeg)");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setOcrImageBase64(reader.result as string);
      setOcrPreviewUrl(URL.createObjectURL(file));
    };
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processImageFile(file);
    }
  };

  // Add Custom Notebook
  const handleCreateBook = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBookName.trim()) return;
    const newBook: WordBook = {
      id: `book-${Date.now()}`,
      name: newBookName.trim(),
      words: [],
    };
    setBooks(prev => [...prev, newBook]);
    setActiveBookId(newBook.id);
    setNewBookName("");
    setCreateBookOpen(false);
  };

  // Delete Book
  const handleDeleteBook = (bookId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (books.length <= 1) {
      alert("您需要保留至少一个单词库。");
      return;
    }
    if (confirm("确定要删除此词库吗？词库内的所有单词数据将不可恢复。")) {
      const remaining = books.filter(b => b.id !== bookId);
      setBooks(remaining);
      if (activeBookId === bookId) {
        setActiveBookId(remaining[0].id);
      }
    }
  };

  // Delete Individual Word from current book
  const handleDeleteWord = (wordId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("确定要在当前词库中删除此单词吗？")) {
      setBooks(prev =>
        prev.map(b => {
          if (b.id === activeBookId) {
            return {
              ...b,
              words: b.words.filter(w => w.id !== wordId),
            };
          }
          return b;
        })
      );
    }
  };

  // Start Dictation Logic
  const startNewSession = (bookId: string, practiceWrongOnly = false) => {
    let sessionWords: VocabularyWord[] = [];

    if (practiceWrongOnly) {
      sessionWords = wrongWords.map(ww => ({
        id: ww.id,
        word: ww.word,
        phonetic: ww.phonetic,
        translation: ww.translation,
        sentence: ww.sentence,
        sentenceTranslation: ww.sentenceTranslation,
        createdAt: Date.now(),
      }));
    } else {
      const sourceBook = books.find(b => b.id === bookId);
      if (!sourceBook || sourceBook.words.length === 0) {
        alert("此词库暂无单词，请先增加单词、批量导入单词，或上传照片一键提取单词！");
        return;
      }
      sessionWords = [...sourceBook.words];
    }

    if (sessionPreferences.shuffle) {
      sessionWords.sort(() => Math.random() - 0.5);
    }

    setSession({
      bookId: practiceWrongOnly ? "wrong" : bookId,
      words: sessionWords,
      shuffled: sessionPreferences.shuffle,
      currentIndex: 0,
      status: "running",
      results: [],
      startedAt: Date.now(),
    });

    setUserInput("");
    setIsAnswerChecked(false);
    resetHints();
    setActiveTab("dictation");
  };

  const resetHints = () => {
    setShowPhoneticHint(false);
    setShowTranslationHint(false);
    setShowSentenceHint(false);
  };

  // Evaluate single spelling check in Live Dictation
  const checkAnswer = () => {
    if (!session) return;
    const currentWord = session.words[session.currentIndex];
    const cleanedTyped = userInput.trim().toLowerCase();
    const cleanedTarget = currentWord.word.trim().toLowerCase();

    // Check match
    const isCorrect = cleanedTyped === cleanedTarget;
    setIsLastAnswerCorrect(isCorrect);
    setIsAnswerChecked(true);

    // Save tracking of used hints
    const hintsUsed: ("phonetic" | "translation" | "sentence")[] = [];
    if (showPhoneticHint) hintsUsed.push("phonetic");
    if (showTranslationHint) hintsUsed.push("translation");
    if (showSentenceHint) hintsUsed.push("sentence");

    // Push into result logs
    const resultsCopy = [...session.results];
    resultsCopy.push({
      wordId: currentWord.id,
      word: currentWord.word,
      typed: userInput,
      isCorrect,
      hintsUsed,
    });

    // Update session state
    const nextSession = { ...session, results: resultsCopy };

    // Update Mistake database
    if (!isCorrect) {
      setWrongWords(prev => {
        const existing = prev.find(ww => ww.word.toLowerCase() === currentWord.word.toLowerCase());
        if (existing) {
          return prev.map(ww =>
            ww.word.toLowerCase() === currentWord.word.toLowerCase()
              ? {
                  ...ww,
                  errorCount: ww.errorCount + 1,
                  lastTestedAt: Date.now(),
                  history: [...(ww.history || []), { typed: userInput, timestamp: Date.now() }],
                }
              : ww
          );
        } else {
          return [
            ...prev,
            {
              id: currentWord.id,
              word: currentWord.word,
              phonetic: currentWord.phonetic,
              translation: currentWord.translation,
              sentence: currentWord.sentence,
              sentenceTranslation: currentWord.sentenceTranslation,
              errorCount: 1,
              lastTestedAt: Date.now(),
              history: [{ typed: userInput, timestamp: Date.now() }],
            },
          ];
        }
      });
    } else {
      // If correct and formerly incorrect, we don't auto-remove, but we can offer manual cleanup. Or let user enjoy the win!
    }

    setSession(nextSession);
  };

  const nextWord = () => {
    if (!session) return;
    if (session.currentIndex + 1 < session.words.length) {
      setSession(prev => prev ? {
        ...prev,
        currentIndex: prev.currentIndex + 1,
      } : null);
      setUserInput("");
      setIsAnswerChecked(false);
      resetHints();
    } else {
      // Completed session
      setSession(prev => prev ? {
        ...prev,
        status: "completed",
        completedAt: Date.now(),
      } : null);
    }
  };

  // Remove word from mistake list (marked as mastered)
  const markMistakeMastered = (wordText: string) => {
    setWrongWords(prev => prev.filter(ww => ww.word !== wordText));
  };

  // Clear all mistakes in bank
  const clearAllMistakes = () => {
    if (confirm("确定要清空错词记录本里的所有词条吗？")) {
      setWrongWords([]);
    }
  };

  // Filter words inside library view
  const filteredWords = activeBook.words.filter(w => {
    const q = searchQuery.toLowerCase();
    return w.word.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q);
  });

  // Highlight word template inside example sentences
  const getClozeSentence = (sentence: string, targetWord: string) => {
    const regex = new RegExp(`\\b${targetWord}\\b`, "gi");
    // Return with a nice underscore placeholder for visualization
    const placeholder = targetWord.replace(/./g, "_");
    return sentence.replace(regex, placeholder);
  };

  // Dictation calculation summary values
  const sessionCorrectCount = session?.results.filter(r => r.isCorrect).length || 0;
  const sessionAccuracy = session?.results.length
    ? Math.round((sessionCorrectCount / session.results.length) * 100)
    : 0;

  return (
    <div id="app-root" className="min-h-screen bg-[#f8fafc] text-[#0f172a] font-sans antialiased flex flex-col md:flex-row">
      
      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-[#000000a0] z-50 flex items-center justify-center p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 flex flex-col items-center text-center animate-fade-in">
            <div className="relative mb-6">
              <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
              <Sparkles className="absolute inset-0 m-auto w-6 h-6 text-blue-500 animate-pulse" />
            </div>
            <h3 className="font-bold text-xl text-gray-900 mb-2">英文智能助手进行中</h3>
            <p className="text-gray-500 text-sm leading-relaxed">{loadingMessage}</p>
          </div>
        </div>
      )}

      {/* Navigation Local Sidebar */}
      <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-[#e2e8f0] flex flex-col p-6 shrink-0">
        {/* Elegant Minimalist Logo Group */}
        <div className="logo flex items-center gap-3 text-2xl font-black tracking-tight text-blue-600 mb-8 select-none">
          <span className="bg-blue-50 text-blue-600 p-2 rounded-2xl border border-blue-100">📘</span>
          <div className="flex flex-col">
            <span className="leading-tight font-extrabold text-lg text-slate-800">SpellingBuddy</span>
            <span className="text-[10px] font-semibold text-slate-400 tracking-widest uppercase">智能单词默写</span>
          </div>
        </div>

        {/* Primary Sidebar Tabs */}
        <nav className="flex flex-row md:flex-col gap-2 overflow-x-auto md:overflow-x-visible pb-3 md:pb-0 mb-6 border-b md:border-b-0 border-[#f1f5f9]">
          <button
            id="tab-library"
            onClick={() => { setActiveTab("library"); setSession(null); }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all shrink-0 md:w-full select-none ${
              activeTab === "library" && !session
                ? "bg-[#eff6ff] text-blue-600 shadow-xs border border-blue-50/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>我的记忆词库</span>
          </button>

          <button
            id="tab-dictation"
            onClick={() => {
              if (session) {
                setActiveTab("dictation");
              } else {
                startNewSession(activeBookId);
              }
            }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all shrink-0 md:w-full select-none ${
              activeTab === "dictation"
                ? "bg-[#eff6ff] text-blue-600 shadow-xs border border-blue-50/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>开始单词默写</span>
            {session && session.status === "running" && (
              <span className="ml-auto w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            )}
          </button>

          <button
            id="tab-mistakes"
            onClick={() => { setActiveTab("mistakes"); setSession(null); }}
            className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl text-xs font-bold transition-all shrink-0 md:w-full relative select-none ${
              activeTab === "mistakes"
                ? "bg-[#eff6ff] text-blue-600 shadow-xs border border-blue-50/50"
                : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            <span>错词本归纳</span>
            {wrongWords.length > 0 && (
              <span className="ml-auto bg-rose-500 text-white font-extrabold text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white">
                {wrongWords.length}
              </span>
            )}
          </button>
        </nav>

        {/* Dynamic Sidebar Progress Stats Card */}
        <div className="mt-auto hidden md:flex flex-col bg-[#f8fafc] rounded-2xl p-4 border border-[#e2e8f0]/60">
          <div className="flex justify-between items-center mb-1">
            <span className="text-xs text-slate-400 font-bold tracking-wide uppercase">错词掌握率</span>
            <span className="text-xs font-extrabold text-blue-600">
              {books.reduce((acc, b) => acc + b.words.length, 0) > 0
                ? `${Math.max(0, 100 - Math.round((wrongWords.length / Math.max(1, books.reduce((acc, b) => acc + b.words.length, 0))) * 100))}%`
                : "100%"}
            </span>
          </div>
          {/* Progress Bar Container */}
          <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mb-3">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{
                width: `${books.reduce((acc, b) => acc + b.words.length, 0) > 0
                  ? Math.max(15, 100 - (wrongWords.length / Math.max(1, books.reduce((acc, b) => acc + b.words.length, 0))) * 100)
                  : 100}%`
              }}
            ></div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-slate-100 pt-2 font-medium">
            <span>总计词条</span>
            <span className="font-extrabold text-slate-800">{books.reduce((acc, b) => acc + b.words.length, 0)} 个</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
            <span>待挑战错词</span>
            <span className="font-extrabold text-rose-500">{wrongWords.length} 个</span>
          </div>
        </div>
      </aside>

      {/* Main Container Content */}
      <main className="flex-1 p-4 md:p-8 flex flex-col gap-6 max-w-6xl mx-auto w-full overflow-y-auto">
        
        {/* ==================== SCREEN 1: LIBRARY VOWELS ==================== */}
        {activeTab === "library" && !session && (
          <div className="flex flex-col gap-6 animate-fade-in">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">我的专属词库</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  智能录入、照片高精度识别，单词的音标、中文释义和语境双语例句全自动化。
                </p>
              </div>

              {/* Functional Quick Import Blocks */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  id="btn-import-ocr"
                  onClick={() => setOcrModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 active:transform active:scale-95 text-white py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/10 cursor-pointer"
                >
                  <ImageIcon className="w-4 h-4" />
                  <span>照片提取单词 (AI OCR)</span>
                </button>
                <button
                  id="btn-import-text"
                  onClick={() => setRawTextImportOpen(true)}
                  className="bg-[#0f172a] hover:bg-[#1e293b] active:transform active:scale-95 text-white py-2 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>手动 / 批量导入</span>
                </button>
              </div>
            </div>

            {/* Notebook Selector & Search Grid bar */}
            <div className="bg-white border border-[#e2e8f0] rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-xs">
              
              {/* Dropdown containing Word Notebook lists */}
              <div className="flex items-center gap-2 flex-wrap max-w-xl">
                <span className="text-xs text-slate-400 font-bold mr-1 shrink-0 uppercase tracking-wide">当前词书:</span>
                
                {books.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => { setActiveBookId(b.id); setSelectedWord(b.words[0] || null); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 select-none border cursor-pointer ${
                      activeBookId === b.id
                        ? "bg-slate-100 text-slate-800 border-slate-300"
                        : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    <span>{b.name}</span>
                    <span className="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ml-1">
                      {b.words.length}
                    </span>
                    {!b.isDefault && (
                      <span
                        onClick={(e) => handleDeleteBook(b.id, e)}
                        className="text-slate-400 hover:text-rose-500 ml-1.5 focus:outline-none transition-colors"
                        title="删除此词书"
                      >
                        <X className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </button>
                ))}

                {createBookOpen ? (
                  <form onSubmit={handleCreateBook} className="flex items-center gap-1">
                    <input
                      type="text"
                      required
                      placeholder="新词书名称..."
                      value={newBookName}
                      onChange={(e) => setNewBookName(e.target.value)}
                      className="bg-white border border-slate-300 rounded-xl px-2 py-1 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none w-32"
                    />
                    <button
                      type="submit"
                      className="bg-emerald-500 text-white rounded-xl p-1 hover:bg-emerald-600"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateBookOpen(false)}
                      className="bg-slate-100 text-slate-500 rounded-xl p-1 hover:bg-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setCreateBookOpen(true)}
                    className="text-blue-600 hover:bg-blue-50 font-bold text-xs py-1.5 px-3 rounded-xl flex items-center gap-1 cursor-pointer border border-dashed border-blue-200"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新建词库</span>
                  </button>
                )}
              </div>

              {/* Word Searcher */}
              <div className="relative w-full md:w-64 max-w-sm shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="搜索内存中的单词及翻译..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pl-9 pr-4 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            {/* Bento Grid: Words List Left & Elaborate Card details Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Left Column: Words Scrollable list */}
              <div className="lg:col-span-5 bg-white border border-[#e2e8f0] rounded-3xl overflow-hidden shadow-xs flex flex-col h-[500px]">
                <div className="p-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                  <h3 className="font-extrabold text-xs text-slate-500 tracking-wide uppercase">
                    词条总数: {filteredWords.length} 个
                  </h3>
                  {filteredWords.length > 0 && (
                    <button
                      onClick={() => startNewSession(activeBookId)}
                      className="bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-xs py-1 px-2.5 rounded-lg transition-colors flex items-center gap-1 select-none cursor-pointer"
                    >
                      <Play className="w-3 h-3 fill-current" />
                      <span>默写本库</span>
                    </button>
                  )}
                </div>

                {filteredWords.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400">
                    <BookOpen className="w-12 h-12 stroke-1 text-slate-300 mb-3" />
                    <p className="text-sm font-medium text-slate-500">此词书内暂无任何词条</p>
                    <p className="text-xs text-slate-400 max-w-xs mt-1">
                      可以通过顶部的 “照片提取” 或 “批量导入” ，让极速 AI 瞬间自动录词并辅全音示例句！
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
                    {filteredWords.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => setSelectedWord(item)}
                        className={`p-3.5 transition-all cursor-pointer flex items-center justify-between group ${
                          selectedWord?.id === item.id
                            ? "bg-[#eff6ff]/70 border-l-4 border-blue-600 pl-2.5"
                            : "hover:bg-[#f8fafc]/50 border-l-4 border-transparent"
                        }`}
                      >
                        <div className="flex flex-col gap-0.5 min-w-0 pr-2">
                          <span className="font-extrabold text-sm text-slate-800 truncate group-hover:text-blue-600 transition-colors">
                            {item.word}
                          </span>
                          <span className="text-slate-400 text-[11px] font-mono whitespace-nowrap overflow-hidden text-ellipsis">
                            {item.phonetic}
                          </span>
                          <span className="text-slate-500 text-xs truncate mt-0.5 font-medium">
                            {item.translation}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); speakWord(item.word); }}
                            className="bg-slate-100 hover:bg-blue-50 text-slate-500 hover:text-blue-600 rounded-xl p-1.5 transition-colors focus:outline-none cursor-pointer"
                            title="朗读发音"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => handleDeleteWord(item.id, e)}
                            className="bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-xl p-1.5 transition-colors focus:outline-none opacity-0 group-hover:opacity-100 cursor-pointer"
                            title="删除词条"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right Column: Complete Word Details & Preview Cards */}
              <div className="lg:col-span-7 bg-white border border-[#e2e8f0] rounded-3xl p-6 md:p-8 flex flex-col h-[500px] shadow-xs relative">
                {selectedWord ? (
                  <div className="flex flex-col h-full animate-fade-in justify-between">
                    <div>
                      {/* Top Meta info */}
                      <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-100">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2.5 py-1 rounded-md">
                          词卡详情
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          录入时间: {new Date(selectedWord.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Display Typography Header */}
                      <div className="flex items-center gap-4 flex-wrap">
                        <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight leading-none">
                          {selectedWord.word}
                        </h2>
                        
                        <button
                          onClick={() => speakWord(selectedWord.word)}
                          className="bg-blue-50 hover:bg-blue-100 text-blue-600 rounded-full p-3 transition-all hover:scale-110 flex items-center justify-center border border-blue-100/50 cursor-pointer"
                          title="听标准美音/英音"
                        >
                          <Volume2 className="w-5 h-5 fill-blue-600/10" />
                        </button>
                      </div>

                      {/* IPA Phonetic Symbols */}
                      <div className="text-base text-slate-400 font-mono tracking-wider mt-2 bg-slate-50 px-3 py-1 rounded-lg inline-block border border-slate-100">
                        {selectedWord.phonetic}
                      </div>

                      {/* Detailed Translation Card */}
                      <div className="mt-6">
                        <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wide mb-1.5">词意释义</h4>
                        <div className="text-lg text-slate-700 font-bold leading-relaxed bg-[#f8fafc] px-4 py-3 rounded-2xl border border-slate-200/50">
                          {selectedWord.translation}
                        </div>
                      </div>

                      {/* AI Generated Dual-Language Context block */}
                      <div className="mt-6 bg-blue-50/40 rounded-2xl p-4 border-l-4 border-blue-500">
                        <h4 className="text-[10px] font-bold text-blue-600/80 uppercase tracking-wider mb-2 flex items-center gap-1">
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>AI 情境教学生动例句</span>
                        </h4>
                        <p className="text-sm font-semibold italic text-slate-700 leading-normal mb-1">
                          "{selectedWord.sentence}"
                        </p>
                        <p className="text-xs text-slate-500 font-medium leading-relaxed">
                          {selectedWord.sentenceTranslation}
                        </p>
                      </div>
                    </div>

                    {/* Word footer tags */}
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
                      <span>记忆辅助：随时点击左侧喇叭进行重复听力输入</span>
                      <span className="text-blue-500 font-bold">{selectedWord.word.length} 字母组成</span>
                    </div>
                  </div>
                ) : (
                  <div className="flex-grow flex flex-col items-center justify-center text-center text-slate-400">
                    <Book className="w-16 h-16 stroke-1 text-slate-200 mb-3" />
                    <p className="text-sm font-bold text-slate-600">空置详情面板</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs">
                      请点击左侧词库列表中的具体英文单词，查看其由 Gemini 深度生成的例句细节及英音国际标准音标。
                    </p>
                  </div>
                )}
              </div>

            </div>
          </div>
        )}


        {/* ==================== SCREEN 2: ACTIVE DICTATION ENGINE ==================== */}
        {activeTab === "dictation" && (
          <div className="flex flex-col gap-6 animate-fade-in max-w-4xl mx-auto w-full">
            
            {/* NO ACTIVE SESSION: Pref Board Config Setup Panel */}
            {!session ? (
              <div className="bg-white border border-[#e2e8f0] rounded-3xl p-6 md:p-8 shadow-xs">
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-2xl">✍️</span>
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">单词拼写默写调试面板</h2>
                    <p className="text-xs text-slate-500 mt-0.5">请快速设置默写特征，测试你是否真正掌握了这些高频核心单词。</p>
                  </div>
                </div>

                {/* Grid Settings Selection */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  
                  {/* Select Book List */}
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">默写单词来源库</label>
                    <div className="flex flex-col gap-2">
                      {books.map(b => (
                        <button
                          key={b.id}
                          disabled={b.words.length === 0}
                          onClick={() => setActiveBookId(b.id)}
                          className={`w-full p-4 rounded-2xl border text-left flex items-center transition-all ${
                            b.words.length === 0 ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                          } ${
                            activeBookId === b.id
                              ? "bg-blue-50/50 border-blue-400 ring-2 ring-blue-500/20"
                              : "bg-white border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <Book className={`w-5 h-5 mr-3 ${activeBookId === b.id ? "text-blue-500" : "text-slate-400"}`} />
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-xs font-black ${activeBookId === b.id ? "text-blue-700" : "text-slate-800"}`}>
                              {b.name}
                            </h4>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              包含 {b.words.length} 个单词
                            </p>
                          </div>
                          {activeBookId === b.id && (
                            <CheckCircle className="w-5 h-5 text-blue-500 shrink-0 ml-2" />
                          )}
                        </button>
                      ))}

                      {wrongWords.length > 0 && (
                        <button
                          onClick={() => {
                            startNewSession("", true);
                          }}
                          className="w-full p-4 rounded-2xl border border-rose-200 bg-rose-50/20 text-left flex items-center hover:bg-rose-50/40 transition-all cursor-pointer"
                        >
                          <AlertTriangle className="w-5 h-5 mr-3 text-rose-500" />
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-black text-rose-800">
                              高频错词集锦 (✨ 错词针对性强化)
                            </h4>
                            <p className="text-[11px] text-rose-500/80 mt-0.5">
                              共计 {wrongWords.length} 个重点漏洞强化单词
                            </p>
                          </div>
                          <ChevronRight className="w-5 h-5 text-rose-400 shrink-0 ml-2" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mode Config list */}
                  <div className="flex flex-col gap-6 bg-[#f8fafc] p-6 rounded-2xl border border-slate-200/50">
                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200 pb-2">挑战偏好设置</h3>
                    
                    {/* Toggle Shuffle */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800">随机乱序拼写</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">随机打乱当前词条的默写顺序，防止位置记忆关联</p>
                      </div>
                      <button
                        onClick={() => setSessionPreferences(prev => ({ ...prev, shuffle: !prev.shuffle }))}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          sessionPreferences.shuffle ? "bg-blue-600" : "bg-slate-300"
                        }`}
                      >
                        <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                          sessionPreferences.shuffle ? "translate-x-5" : ""
                        }`} />
                      </button>
                    </div>

                    {/* Toggle Audio AutoSpeak */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-extrabold text-slate-800">智能音频自动发音</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">进入每个单词默写时，系统自动播报美式英语发音</p>
                      </div>
                      <button
                        onClick={() => setSessionPreferences(prev => ({ ...prev, autoSpeak: !prev.autoSpeak }))}
                        className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer ${
                          sessionPreferences.autoSpeak ? "bg-blue-600" : "bg-slate-300"
                        }`}
                      >
                        <span className={`absolute top-1 left-1 bg-white w-4 h-4 rounded-full transition-transform ${
                          sessionPreferences.autoSpeak ? "translate-x-5" : ""
                        }`} />
                      </button>
                    </div>

                    {/* Core Quick Checklist details */}
                    <div className="text-xs text-slate-400 space-y-2 pt-4 border-t border-slate-200">
                      <p className="flex items-start gap-1">
                        <span className="text-blue-500">✓</span> 
                        <span>默写拼写严格判断，不分大小写、去掉前后多余空格。</span>
                      </p>
                      <p className="flex items-start gap-1">
                        <span className="text-blue-500">✓</span> 
                        <span>支持音标、中文释义、例句等3类多维度提示。</span>
                      </p>
                    </div>
                  </div>

                </div>

                <div className="flex items-center justify-end border-t border-slate-100 pt-6">
                  <button
                    disabled={activeBook.words.length === 0}
                    onClick={() => startNewSession(activeBookId)}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-8 py-3.5 rounded-2xl text-xs font-black transition-all hover:scale-[1.02] shadow-md shadow-blue-500/10 cursor-pointer"
                  >
                    🚀 开启高能默写模式 ({activeBook.words.length} 词条)
                  </button>
                </div>
              </div>
            ) : session.status === "running" ? (
              
              /* ==================== SCREEN 2A: ACTIVE TEST CARD SCREEN ==================== */
              <div className="bg-white border border-[#e2e8f0] rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xs relative animate-fade-in">
                
                {/* Upper progress step card */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-slate-100 text-slate-500 font-extrabold px-3 py-1 rounded-full uppercase">
                      正在默写第 {session.currentIndex + 1} / {session.words.length} 个单词
                    </span>
                    {session.bookId === "wrong" && (
                      <span className="text-xs bg-rose-50 text-rose-600 px-3 py-1 rounded-full font-bold">
                        错词冲刺
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      if (confirm("当前默写尚未完成，确认退出并保存现有进度吗？")) {
                        setSession(null);
                      }
                    }}
                    className="text-slate-400 hover:text-slate-600 font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    放弃本次默写
                  </button>
                </div>

                {/* Progress bar container */}
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-sky-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${((session.currentIndex) / session.words.length) * 100}%` }}
                  ></div>
                </div>

                {/* Core Dictation board with spelling action */}
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  
                  {/* Speaker Button: Trigger manual audio hearer */}
                  <button
                    onClick={() => speakWord(session.words[session.currentIndex].word)}
                    className="bg-blue-600 text-white rounded-full p-7 hover:scale-[1.08] active:scale-95 transition-all shadow-lg hover:shadow-blue-500/20 flex items-center justify-center select-none cursor-pointer mb-2 relative group"
                    title="重新播报发音 (点击听词)"
                  >
                    <Volume2 className="w-10 h-10 fill-white/10" />
                    <span className="absolute -bottom-7 bg-slate-800 text-white font-bold text-[9px] px-2 py-0.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                      点击听音发音 (🔊)
                    </span>
                  </button>

                  <p className="text-slate-400 font-medium text-xs mt-3 mb-8">
                    支持耳麦播报发音，请仔细聆听单词并发音拼写。
                  </p>

                  {/* Multi-Dimensional Hint Buttons */}
                  <div className="flex flex-wrap items-center justify-center gap-3.5 mb-8 max-w-xl">
                    
                    {/* Phoneitc Symbol hint view button */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setShowPhoneticHint(prev => !prev)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border select-none cursor-pointer flex items-center gap-1.5 ${
                          showPhoneticHint
                            ? "bg-slate-100 text-slate-800 border-slate-300"
                            : "bg-white text-slate-500 hover:text-slate-700 border-slate-200"
                        }`}
                      >
                        <HintIcon className="w-3.5 h-3.5 text-blue-500" />
                        <span>音标暗示 ({showPhoneticHint ? "显示中" : "隐藏"})</span>
                      </button>
                      {showPhoneticHint && (
                        <div className="mt-1.5 text-xs text-sky-700 font-mono bg-sky-50 border border-sky-100 px-3 py-1 rounded-lg animate-fade-in text-center">
                          {session.words[session.currentIndex].phonetic}
                        </div>
                      )}
                    </div>

                    {/* Translation hint view button */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setShowTranslationHint(prev => !prev)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border select-none cursor-pointer flex items-center gap-1.5 ${
                          showTranslationHint
                            ? "bg-slate-100 text-slate-800 border-slate-300"
                            : "bg-white text-slate-500 hover:text-slate-700 border-slate-200"
                        }`}
                      >
                        <HintIcon className="w-3.5 h-3.5 text-blue-500" />
                        <span>词意释义 ({showTranslationHint ? "显示中" : "隐藏"})</span>
                      </button>
                      {showTranslationHint && (
                        <div className="mt-1.5 text-xs text-sky-700 font-bold bg-sky-50 border border-sky-100 px-3 py-1 rounded-lg max-w-xs animate-fade-in text-center">
                          {session.words[session.currentIndex].translation}
                        </div>
                      )}
                    </div>

                    {/* Sentence hint view button */}
                    <div className="flex flex-col items-center">
                      <button
                        onClick={() => setShowSentenceHint(prev => !prev)}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border select-none cursor-pointer flex items-center gap-1.5 ${
                          showSentenceHint
                            ? "bg-slate-100 text-slate-800 border-slate-300"
                            : "bg-white text-slate-500 hover:text-slate-700 border-slate-200"
                        }`}
                      >
                        <HintIcon className="w-3.5 h-3.5 text-blue-500" />
                        <span>例句暗示 (填空形) ({showSentenceHint ? "显示中" : "隐藏"})</span>
                      </button>
                      {showSentenceHint && (
                        <div className="mt-1.5 max-w-sm text-xs text-sky-700 bg-sky-50 border border-sky-100 p-3 rounded-lg animate-fade-in text-center">
                          <p className="font-semibold italic text-slate-700 mb-1 leading-relaxed">
                            "{getClozeSentence(session.words[session.currentIndex].sentence, session.words[session.currentIndex].word)}"
                          </p>
                          <p className="text-[11px] text-slate-500 leading-normal">
                            含义: {session.words[session.currentIndex].sentenceTranslation}
                          </p>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Input field spelling area */}
                  <div className="w-full max-w-md flex flex-col gap-3">
                    <input
                      type="text"
                      dir="ltr"
                      disabled={isAnswerChecked}
                      placeholder={isAnswerChecked ? "" : "在此拼写拼写单词并敲击回车 Enter..."}
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && userInput.trim().length > 0) {
                          if (!isAnswerChecked) {
                            checkAnswer();
                          } else {
                            nextWord();
                          }
                        }
                      }}
                      className={`w-full bg-slate-50 border-2 rounded-2xl py-4 px-6 text-center text-xl font-bold tracking-wide focus:outline-none focus:ring-4 focus:ring-blue-100 transition-all ${
                        isAnswerChecked
                          ? isLastAnswerCorrect
                            ? "border-emerald-500 bg-emerald-50 text-emerald-800 focus:ring-emerald-100"
                            : "border-rose-500 bg-rose-50 text-rose-800 focus:ring-rose-100"
                          : "border-slate-300 focus:border-blue-500 focus:bg-white"
                      }`}
                      autoFocus
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck="false"
                    />

                    {/* Feedback result banner */}
                    {isAnswerChecked && (
                      <div className="animate-fade-in mt-1">
                        {isLastAnswerCorrect ? (
                          <div className="flex items-center justify-center gap-2 text-emerald-600 font-bold bg-emerald-100/40 border border-emerald-200 p-3 rounded-2xl text-sm">
                            <CheckCircle className="w-4.5 h-4.5 shrink-0" />
                            <span>非常棒！拼写完全正确！</span>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2 text-left bg-rose-100/40 border border-rose-200 p-4 rounded-2xl text-sm">
                            <div className="flex items-center gap-2 text-rose-600 font-extrabold">
                              <X className="w-5 h-5 shrink-0 bg-rose-100 text-rose-600 rounded-full" />
                              <span>拼写错误</span>
                            </div>
                            <div className="text-slate-700 font-medium space-y-1 mt-1 text-xs pl-7">
                              <p>你输入的尝试: <span className="font-mono font-bold text-rose-600 bg-white px-2 py-0.5 rounded border border-rose-100">{userInput || "空"}</span></p>
                              <p>标准备忘词条: <span className="font-mono font-bold text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-100 text-[13px]">{session.words[session.currentIndex].word}</span></p>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                </div>

                {/* Lower Action bar: Next button / Submit button */}
                <div className="flex justify-between items-center border-t border-slate-100 pt-6 mt-4">
                  <div className="text-xs text-slate-400 font-medium">
                    {isAnswerChecked ? "已锁定拼写结果。敲击 Enter 键或点击右侧即可进入下一个" : "请写完单词后，敲击键盘回车键 (Enter) 验证拼写。"}
                  </div>
                  
                  {isAnswerChecked ? (
                    <button
                      onClick={nextWord}
                      className="bg-[#0f172a] hover:bg-[#1e293b] text-white px-6 py-3 rounded-xl text-xs font-black transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>下一个 ({session.currentIndex + 1 < session.words.length ? "Next" : "查看成绩"})</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      disabled={userInput.trim().length === 0}
                      onClick={checkAnswer}
                      className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl text-xs font-black transition-colors cursor-pointer"
                    >
                      验证输入
                    </button>
                  )}
                </div>

              </div>
            ) : (
              
              /* ==================== SCREEN 2B: SESSION STATS SUMMARY SHEET ==================== */
              <div className="bg-white border border-[#e2e8f0] rounded-3xl p-6 md:p-8 flex flex-col gap-6 shadow-xs animate-fade-in">
                
                {/* Score Banner Title */}
                <div className="text-center py-6 border-b border-slate-100">
                  <div className="inline-flex items-center justify-center bg-blue-50 text-blue-600 p-4 rounded-3xl mb-3">
                    <Award className="w-12 h-12 stroke-[1.5]" />
                  </div>
                  <h2 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">默写挑战测试报告</h2>
                  <p className="text-xs text-slate-400 mt-1">拼写大胜利！让我们对本次记忆成果进行一次深度复盘归纳吧。</p>
                </div>

                {/* Score Grid Numbers */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 text-center">
                    <span className="text-[10px] text-slate-400 font-extrabold uppercase tracking-wide block">测试单词总量</span>
                    <span className="text-3xl font-black text-slate-800 tracking-tight mt-1 block">
                      {session.results.length} <span className="text-xs font-medium text-slate-400">词</span>
                    </span>
                  </div>

                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 text-center">
                    <span className="text-[10px] text-emerald-600/80 font-extrabold uppercase tracking-wide block">拼写正确</span>
                    <span className="text-3xl font-black text-emerald-600 tracking-tight mt-1 block">
                      {sessionCorrectCount} <span className="text-xs font-medium text-emerald-400">词</span>
                    </span>
                  </div>

                  <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 text-center">
                    <span className="text-[10px] text-rose-600/80 font-extrabold uppercase tracking-wide block">拼写错误词</span>
                    <span className="text-3xl font-black text-rose-600 tracking-tight mt-1 block">
                      {session.results.length - sessionCorrectCount} <span className="text-xs font-medium text-slate-400">词</span>
                    </span>
                  </div>

                  <div className="bg-blue-50/40 border border-blue-100 rounded-2xl p-4 text-center">
                    <span className="text-[10px] text-blue-600 font-extrabold uppercase tracking-wide block">本次正确率</span>
                    <span className="text-3xl font-black text-blue-600 tracking-tight mt-1 block">
                      {sessionAccuracy}%
                    </span>
                  </div>

                </div>

                {/* Master Details items log table */}
                <div>
                  <h3 className="font-bold text-xs text-slate-400 uppercase tracking-widest mb-3">本次拼写考查详情流水账</h3>
                  <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-100">
                    
                    {session.results.map((res, index) => {
                      const matchedWordObj = session.words.find(w => w.id === res.wordId);
                      return (
                        <div key={index} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white hover:bg-slate-50/30 transition-colors">
                          
                          <div className="flex items-start gap-3 min-w-0">
                            <span className="text-xs font-bold text-slate-400 mt-1 bg-slate-100 min-w-6 h-6 px-1 flex items-center justify-center rounded-lg">
                              #{index + 1}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-extrabold text-slate-800 text-sm">{res.word}</span>
                                <span className="text-xs text-slate-400 font-mono tracking-wide">{matchedWordObj?.phonetic}</span>
                              </div>
                              <p className="text-[11px] text-slate-500 mt-0.5 truncate">{matchedWordObj?.translation}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-4 text-xs font-medium text-slate-500 justify-between md:justify-end">
                            <div>
                              <span>你输入的: </span>
                              <span className={`font-mono font-bold ${res.isCorrect ? "text-emerald-600" : "text-rose-500"}`}>
                                {res.typed || "(未输入)"}
                              </span>
                            </div>
                            {res.hintsUsed.length > 0 && (
                              <div className="hidden lg:block bg-yellow-50 text-yellow-700 text-[10px] px-2 py-0.5 rounded-lg border border-yellow-105">
                                启用了 {res.hintsUsed.length} 次学提示
                              </div>
                            )}
                            <div>
                              {res.isCorrect ? (
                                <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-bold text-[11px] flex items-center gap-1">
                                  <Check className="w-3.5 h-3.5" /> Correct
                                </span>
                              ) : (
                                <span className="bg-rose-50 text-rose-700 px-2.5 py-1 rounded-full font-bold text-[11px] flex items-center gap-1">
                                  <X className="w-3.5 h-3.5" /> Incorrect
                                </span>
                              )}
                            </div>
                          </div>

                        </div>
                      );
                    })}

                  </div>
                </div>

                {/* Bottom Report footer buttons */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-6 mt-2">
                  <button
                    onClick={() => setSession(null)}
                    className="border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs py-3 px-6 rounded-2xl transition-colors cursor-pointer"
                  >
                    返回默写偏好调试
                  </button>

                  <div className="flex items-center gap-2">
                    {session.results.some(r => !r.isCorrect) && (
                      <button
                        onClick={() => {
                          startNewSession("", true);
                        }}
                        className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 py-3 px-6 rounded-2xl text-xs font-bold transition-all cursor-pointer"
                      >
                        🔥 挑战刚刚拼错的单词
                      </button>
                    )}
                    <button
                      onClick={() => startNewSession(session.bookId)}
                      className="bg-blue-600 hover:bg-blue-700 text-white py-3 px-6 rounded-2xl text-xs font-black transition-all hover:scale-[1.02] cursor-pointer"
                    >
                      🔄 重新对本词库启动默写
                    </button>
                  </div>
                </div>

              </div>
            )}

          </div>
        )}


        {/* ==================== SCREEN 3: INCORRECT WORDS DICTIONARY ==================== */}
        {activeTab === "mistakes" && !session && (
          <div className="flex flex-col gap-6 animate-fade-in mr-auto ml-auto max-w-4xl w-full">
            
            {/* Header Column area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">错词智能攻坚归类本</h1>
                <p className="text-slate-500 text-sm mt-0.5">
                  所有默写过程中拼错的单词将全量追踪并智能累加错误次数，方便针对性各个击破。
                </p>
              </div>

              {wrongWords.length > 0 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={clearAllMistakes}
                    className="border border-slate-200 text-slate-500 hover:bg-rose-50 hover:text-rose-600 font-bold text-xs py-2 px-4 rounded-xl transition-all cursor-pointer"
                  >
                    一键清空错词集
                  </button>
                  <button
                    onClick={() => startNewSession("", true)}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-black text-xs py-2.5 px-5 rounded-xl flex items-center gap-1.5 transition-all shadow-sm shadow-rose-500/10 cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4 animate-spin-slow" />
                    <span>错词突击强化训练 ({wrongWords.length} 词条)</span>
                  </button>
                </div>
              )}
            </div>

            {/* Core wrong words grid cards */}
            {wrongWords.length === 0 ? (
              <div className="bg-white border border-[#e2e8f0] rounded-3xl p-12 text-center text-slate-400">
                <div className="inline-flex items-center justify-center p-4 bg-emerald-50 text-emerald-500 rounded-3xl mb-4">
                  <CheckCircle className="w-12 h-12 stroke-[1.2]" />
                </div>
                <h3 className="text-lg font-black text-slate-800">极其完美！暂无任何拼错单词</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                  你太棒了！你的本子错词归类为空。赶快去库里挑一两个词汇清单进行一场真正的极速单词默写吧！
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {wrongWords.map((ww) => (
                  <div key={ww.id} className="bg-white border border-[#e2e8f0] rounded-2xl p-5 flex flex-col justify-between hover:border-slate-300 transition-all shadow-xs relative overflow-hidden group">
                    
                    {/* Error counter top indicator */}
                    <span className="absolute top-0 right-0 bg-rose-500 text-white text-[10px] font-extrabold px-3 py-1 rounded-bl-xl">
                      第 {ww.errorCount} 次拼错
                    </span>

                    <div>
                      {/* Title block with click voice */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-extrabold text-base text-slate-900">{ww.word}</span>
                        <span className="text-[11px] font-mono text-slate-400 tracking-wide">{ww.phonetic}</span>
                        
                        <button
                          onClick={() => speakWord(ww.word)}
                          className="text-slate-400 hover:text-blue-500 transition-colors cursor-pointer"
                          title="听发音朗读"
                        >
                          <Volume2 className="w-4 h-4" />
                        </button>
                      </div>

                      <p className="text-xs text-slate-600 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 font-bold mb-3 mt-1.5 leading-relaxed">
                        {ww.translation}
                      </p>

                      <div className="bg-slate-50 border-l-2 border-amber-400/80 p-2.5 rounded-r-lg">
                        <p className="text-[11px] text-slate-500 italic leading-tight">
                          "{getClozeSentence(ww.sentence, ww.word)}"
                        </p>
                        <p className="text-[10px] text-slate-400 leading-normal mt-0.5">
                          {ww.sentenceTranslation}
                        </p>
                      </div>
                    </div>

                    {/* Master Action triggers */}
                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-100">
                      <span className="text-[10px] text-slate-400 font-medium">
                        上次测试: {new Date(ww.lastTestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>

                      <button
                        onClick={() => markMistakeMastered(ww.word)}
                        className="text-emerald-600 hover:bg-emerald-50 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-emerald-200"
                      >
                        已牢记 (移除错词)
                      </button>
                    </div>

                  </div>
                ))}
              </div>
            )}

          </div>
        )}

      </main>

      {/* ==================== MODAL: OCR AI IMAGE SCANNER ==================== */}
      {ocrModalOpen && (
        <div className="fixed inset-0 bg-black/65 z-40 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-gray-100 overflow-hidden">
            
            {/* Header of Modal */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="bg-blue-50 text-blue-600 p-1.5 rounded-xl">📸</span>
                <h3 className="font-black text-slate-900 text-sm md:text-base">AI 图像识词并生成教案</h3>
              </div>
              <button
                onClick={() => { setOcrModalOpen(false); setOcrImageBase64(null); setOcrPreviewUrl(null); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body drop area */}
            <div className="p-6 flex flex-col gap-5">
              <p className="text-xs text-slate-500 leading-relaxed">
                上传包含手写笔迹、英文书籍、英语课本、词汇表、说明书的照片。我们的 Gemini 3.5 智能芯片将自动做高精 OCR 扫描、滤除乱码纯理净字，并自动拼合<b>标准音标国际 IPA、中文释义和情景教学双语例句</b>！
              </p>

              {/* Drag n Drop Sandbox container */}
              <div
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => document.getElementById("ocr-file-picker")?.click()}
                className={`border-4 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center min-h-48 ${
                  ocrPreviewUrl
                    ? "border-emerald-500/50 bg-[#e8f5e9]/10"
                    : "border-slate-300 hover:border-blue-500 bg-slate-50/50 hover:bg-slate-50"
                }`}
              >
                <input
                  id="ocr-file-picker"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />

                {ocrPreviewUrl ? (
                  <div className="relative w-full max-h-44 overflow-hidden rounded-xl">
                    <img
                      src={ocrPreviewUrl}
                      alt="Preview upload"
                      className="mx-auto max-h-40 object-contain rounded-lg"
                    />
                    <div className="absolute inset-0 bg-black/35 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                      <span className="text-white text-xs font-bold bg-slate-800/80 px-3 py-1.5 rounded-lg">
                        拖入或点击更换图片
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center">
                    <Upload className="w-10 h-10 stroke-[1.5] text-slate-400 mb-2.5" />
                    <span className="text-xs font-bold text-slate-700">拖拽照片或点击此区域浏览</span>
                    <span className="text-[10px] text-slate-400 mt-1">支持 PNG, JPG, JPEG 格式图片</span>
                  </div>
                )}
              </div>

              {/* Notice text */}
              <div className="text-[11px] text-amber-600 bg-amber-50 p-2.5 rounded-lg">
                ⚠️ 注意：为了确保识别极佳，请将含有单词的说明、教材对平拍摄，减少边角过度反光遮蔽。
              </div>

            </div>

            {/* Action bottoms of Modal */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3.5">
              <button
                type="button"
                onClick={() => { setOcrModalOpen(false); setOcrImageBase64(null); setOcrPreviewUrl(null); }}
                className="px-5 py-2 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-500 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!ocrImageBase64}
                onClick={handleOcrSubmit}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-500/10 cursor-pointer"
              >
                ⚡ 启动 Gemini AI 离析及教案铺全
              </button>
            </div>

          </div>
        </div>
      )}


      {/* ==================== MODAL: BATCH TEXT EXCEL / COMA IMPORT ==================== */}
      {rawTextImportOpen && (
        <div className="fixed inset-0 bg-black/65 z-40 flex items-center justify-center p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-gray-100 overflow-hidden">
            
            {/* Header of Modal */}
            <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <span className="bg-[#0f172a] text-white p-1.5 rounded-xl">✍️</span>
                <h3 className="font-black text-slate-900 text-sm md:text-base">批量录词 / 手动一字添加</h3>
              </div>
              <button
                onClick={() => { setRawTextImportOpen(false); setTextImportList(""); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body drop area */}
            <div className="p-6 flex flex-col gap-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                请在下方区域粘贴你想录入的英文单词/词汇短语（支持换行、句号、中英文逗号拆分分割）：
              </p>

              <div>
                <textarea
                  required
                  rows={6}
                  placeholder={`例如:\nambition\nbenevolent, diligent\nenthusiasm`}
                  value={textImportList}
                  onChange={(e) => setTextImportList(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-3.5 text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder:text-slate-400 font-mono"
                />
              </div>

              <div className="bg-blue-50/50 p-3 rounded-lg flex items-start gap-2 border border-blue-100">
                <Sparkles className="w-4.5 h-4.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500">
                  仅录入基础单词串亦可！Gemini AI 会立刻自动为您的词库补全标准发音国际音标、详细中文含义，以及一条可直接用于<b>拼写暗示的高清中英文例句</b>！
                </p>
              </div>

            </div>

            {/* Action bottoms of Modal */}
            <div className="p-5 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-3.5">
              <button
                type="button"
                onClick={() => { setRawTextImportOpen(false); setTextImportList(""); }}
                className="px-5 py-2 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-500 transition-colors"
              >
                取消
              </button>
              <button
                type="button"
                disabled={textImportList.trim().length === 0}
                onClick={handleTextImportSubmit}
                className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white px-6 py-2 rounded-xl text-xs font-bold transition-all shadow-sm shadow-blue-500/10 cursor-pointer"
              >
                ✨ 智能补齐音形释义录入
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
