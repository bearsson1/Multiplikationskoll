/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Calculator, 
  Trophy, 
  Settings, 
  Play, 
  RotateCcw, 
  CheckCircle2, 
  XCircle, 
  Timer, 
  BarChart3,
  GraduationCap,
  ChevronRight,
  School
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine
} from 'recharts';
import confetti from 'canvas-confetti';

// --- Types ---

enum GameMode {
  MENU = 'MENU',
  PRACTICE_SETUP = 'PRACTICE_SETUP',
  PLAYING = 'PLAYING',
  RESULTS = 'RESULTS'
}

enum PlayType {
  PRACTICE = 'PRACTICE',
  TEST = 'TEST'
}

interface Question {
  a: number;
  b: number;
  answer: number;
  table: number;
}

interface Result {
  question: Question;
  userAnswer: number | null;
  isCorrect: boolean;
  timeTaken: number;
  points: number;
}

// --- Constants ---

const MAX_TIME_PER_QUESTION = 6; // seconds
const MAX_POINTS_PER_QUESTION = 6;
const TEST_QUESTION_COUNT = 40;
const MIN_PRACTICE_QUESTIONS_PER_TABLE = 10;
const PASS_SCORE_THRESHOLD = 36;
const PASS_SPEED_THRESHOLD = 120;

const DEFAULT_COLORS: Record<number, string> = {
  1: '#64748b', // slate
  2: '#3b82f6', // blue
  3: '#6366f1', // indigo
  4: '#8b5cf6', // violet
  5: '#a855f7', // purple
  6: '#d946ef', // fuchsia
  7: '#ec4899', // pink
  8: '#f43f5e', // rose
  9: '#f97316', // orange
  10: '#f59e0b', // amber
};

const COLOR_PALETTE = [
  '#64748b', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', 
  '#d946ef', '#ec4899', '#f43f5e', '#ef4444', '#f97316', 
  '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#06b6d4'
];

const lightenColor = (hex: string, amount: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  
  const lr = Math.min(255, Math.floor(r + (255 - r) * amount));
  const lg = Math.min(255, Math.floor(g + (255 - g) * amount));
  const lb = Math.min(255, Math.floor(b + (255 - b) * amount));
  
  return `rgb(${lr}, ${lg}, ${lb})`;
};

// --- Sound Effects Helper ---
const playSound = (type: 'correct' | 'wrong' | 'complete' | 'click') => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'correct') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(523.25, audioCtx.currentTime); // C5
      oscillator.frequency.exponentialRampToValueAtTime(1046.50, audioCtx.currentTime + 0.1); // C6
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.2);
    } else if (type === 'wrong') {
      oscillator.type = 'sawtooth';
      oscillator.frequency.setValueAtTime(220, audioCtx.currentTime); // A3
      oscillator.frequency.linearRampToValueAtTime(110, audioCtx.currentTime + 0.2); // A2
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.3);
    } else if (type === 'complete') {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + i * 0.1 + 0.3);
        osc.start(audioCtx.currentTime + i * 0.1);
        osc.stop(audioCtx.currentTime + i * 0.1 + 0.3);
      });
    } else if (type === 'click') {
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime);
      gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.05);
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.05);
    }
  } catch (e) {
    console.warn('Audio not supported or blocked', e);
  }
};

interface HistoryEntry {
  id: string;
  date: string;
  type: PlayType;
  score: number;
  total: number;
  points: number;
  isPassed: boolean;
}

// --- Components ---

export default function App() {
  const [mode, setMode] = useState<GameMode>(GameMode.MENU);
  const [playType, setPlayType] = useState<PlayType>(PlayType.PRACTICE);
  const [selectedTables, setSelectedTables] = useState<number[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [userInput, setUserInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(MAX_TIME_PER_QUESTION);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'correct' | 'wrong' | 'timeout' | null>(null);
  const [lastFeedback, setLastFeedback] = useState<{ isCorrect: boolean; correctAnswer: number } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [tableColors, setTableColors] = useState<Record<number, string>>(DEFAULT_COLORS);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  // Load history and colors on mount
  useEffect(() => {
    const savedHistory = localStorage.getItem('plonninge_math_history');
    if (savedHistory) {
      try {
        setHistory(JSON.parse(savedHistory));
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }

    const savedColors = localStorage.getItem('plonninge_table_colors');
    if (savedColors) {
      try {
        setTableColors(JSON.parse(savedColors));
      } catch (e) {
        console.error('Failed to parse colors', e);
      }
    }
  }, []);

  // Save history to localStorage
  useEffect(() => {
    localStorage.setItem('plonninge_math_history', JSON.stringify(history));
  }, [history]);

  // Save colors to localStorage
  useEffect(() => {
    localStorage.setItem('plonninge_table_colors', JSON.stringify(tableColors));
  }, [tableColors]);

  // --- Logic ---

  const generateQuestions = (type: PlayType, tables: number[]) => {
    let qList: Question[] = [];
    
    // Both Practice and Test modes now use 40 questions from the selected tables
    for (let i = 0; i < TEST_QUESTION_COUNT; i++) {
      const a = tables[Math.floor(Math.random() * tables.length)];
      const b = Math.floor(Math.random() * 10) + 1;
      qList.push({ a, b, answer: a * b, table: a });
    }
    
    return qList;
  };

  const startSession = (type: PlayType, tables: number[]) => {
    const q = generateQuestions(type, tables);
    setQuestions(q);
    setPlayType(type);
    setCurrentIndex(0);
    setResults([]);
    setMode(GameMode.PLAYING);
    resetQuestionState();
  };

  const resetQuestionState = () => {
    setUserInput('');
    setTimeLeft(MAX_TIME_PER_QUESTION);
    setShowFeedback(false);
    setFeedbackType(null);
    startTimeRef.current = Date.now();
  };

  useEffect(() => {
    if (mode === GameMode.PLAYING && !showFeedback && playType === PlayType.TEST) {
      timerRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 0.1) {
            handleAnswer(null); // Timeout
            return 0;
          }
          return prev - 0.1;
        });
      }, 100);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [mode, showFeedback, currentIndex, playType]);

  const handleAnswer = (val: number | null) => {
    if (showFeedback) return;

    const currentQ = questions[currentIndex];
    const isCorrect = val === currentQ.answer;
    const isTimeout = val === null;
    const timeTaken = (Date.now() - startTimeRef.current) / 1000;
    
    if (isCorrect) {
      playSound('correct');
      setFeedbackType('correct');
      // Small burst for every correct answer
      confetti({
        particleCount: 40,
        spread: 50,
        origin: { y: 0.7 },
        colors: [tableColors[currentQ.table], '#10b981', '#ffffff']
      });
    } else if (isTimeout) {
      playSound('wrong');
      setFeedbackType('timeout');
    } else {
      playSound('wrong');
      setFeedbackType('wrong');
    }

    let points = 0;
    if (isCorrect) {
      points = Math.max(1, Math.ceil(MAX_POINTS_PER_QUESTION * (1 - (timeTaken / MAX_TIME_PER_QUESTION))));
    }

    const result: Result = {
      question: currentQ,
      userAnswer: val,
      isCorrect,
      timeTaken,
      points
    };

    const newResults = [...results, result];
    setResults(newResults);

    setLastFeedback({ isCorrect, correctAnswer: currentQ.answer });
    setShowFeedback(true);

    const delay = isCorrect ? 800 : 2000;

    setTimeout(() => {
      nextQuestion(newResults);
    }, delay);
  };

  const nextQuestion = (currentResults: Result[]) => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      resetQuestionState();
    } else {
      setMode(GameMode.RESULTS);
      const totalCorrect = currentResults.filter(r => r.isCorrect).length;
      const totalPoints = currentResults.reduce((sum, r) => sum + r.points, 0);
      const passed = playType === PlayType.TEST && (totalCorrect >= PASS_SCORE_THRESHOLD || totalPoints >= PASS_SPEED_THRESHOLD);
      
      if (passed) {
        playSound('complete');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      }

      // Save to history
      const newEntry: HistoryEntry = {
        id: Date.now().toString(),
        date: new Date().toLocaleString('sv-SE'),
        type: playType,
        score: totalCorrect,
        total: questions.length,
        points: totalPoints,
        isPassed: passed
      };
      setHistory(prev => [newEntry, ...prev].slice(0, 20)); // Keep last 20
    }
  };

  const toggleTable = (t: number) => {
    playSound('click');
    setSelectedTables(prev => 
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
  };

  const cycleTableColor = (t: number, e: React.MouseEvent) => {
    e.stopPropagation();
    playSound('click');
    setTableColors(prev => {
      const currentColor = prev[t];
      const currentIndex = COLOR_PALETTE.indexOf(currentColor);
      const nextIndex = (currentIndex + 1) % COLOR_PALETTE.length;
      return { ...prev, [t]: COLOR_PALETTE[nextIndex] };
    });
  };

  // --- Statistics ---

  const stats = useMemo(() => {
    if (results.length === 0) return null;
    
    const totalCorrect = results.filter(r => r.isCorrect).length;
    const totalPoints = results.reduce((sum, r) => sum + r.points, 0);
    
    const tableStats: Record<number, { correct: number; total: number }> = {};
    results.forEach(r => {
      const t = r.question.table;
      if (!tableStats[t]) tableStats[t] = { correct: 0, total: 0 };
      tableStats[t].total++;
      if (r.isCorrect) tableStats[t].correct++;
    });

    const needsPractice = Object.entries(tableStats)
      .filter(([_, s]) => s.correct / s.total < 0.8)
      .map(([t]) => t);

    const wrongAnswers = results.filter(r => !r.isCorrect);

    return { totalCorrect, totalPoints, needsPractice, wrongAnswers };
  }, [results]);

  const isPassed = playType === PlayType.TEST && stats && (stats.totalCorrect >= PASS_SCORE_THRESHOLD || stats.totalPoints >= PASS_SPEED_THRESHOLD);

  // --- Render Helpers ---

  const renderMenu = () => (
    <div className="flex flex-col items-center justify-center space-y-8 py-12">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-emerald-100 rounded-full text-emerald-600 mb-4">
          <School size={48} />
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-slate-900">Plönninge multiplikationskoll</h1>
        <p className="text-slate-500 text-lg">Välj ett läge för att börja träna!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl">
        <motion.button 
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setPlayType(PlayType.PRACTICE);
            setMode(GameMode.PRACTICE_SETUP);
          }}
          className="group flex flex-col items-center p-6 sm:p-8 bg-white border-2 border-slate-100 rounded-3xl shadow-sm hover:border-emerald-500 hover:shadow-md transition-all duration-300"
        >
          <div className="p-3 sm:p-4 bg-emerald-50 rounded-2xl text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white transition-colors mb-4">
            <Calculator size={28} className="sm:w-8 sm:h-8" />
          </div>
          <span className="text-lg sm:text-xl font-semibold text-slate-800">Öva</span>
          <p className="text-slate-500 text-center mt-2 text-xs sm:text-sm">Välj specifika tabeller och få direkt feedback.</p>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.05, y: -5 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setPlayType(PlayType.TEST);
            setMode(GameMode.PRACTICE_SETUP);
          }}
          className="group flex flex-col items-center p-6 sm:p-8 bg-white border-2 border-slate-100 rounded-3xl shadow-sm hover:border-indigo-500 hover:shadow-md transition-all duration-300"
        >
          <div className="p-3 sm:p-4 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-500 group-hover:text-white transition-colors mb-4">
            <Trophy size={28} className="sm:w-8 sm:h-8" />
          </div>
          <span className="text-lg sm:text-xl font-semibold text-slate-800">Test</span>
          <p className="text-slate-500 text-center mt-2 text-xs sm:text-sm">40 frågor på tid. Kan du bli godkänd?</p>
        </motion.button>
      </div>

      {/* History Section */}
      {history.length > 0 && (
        <div className="w-full max-w-2xl bg-white rounded-3xl border border-slate-100 p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
            <BarChart3 size={20} className="text-indigo-500" />
            <span>Senaste resultat</span>
          </h3>
          <div className="space-y-3">
            {history.map(entry => (
              <div key={entry.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${entry.isPassed ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-500'}`}>
                    {entry.type === PlayType.TEST ? <Trophy size={16} /> : <Calculator size={16} />}
                  </div>
                  <div>
                    <span className="block text-sm font-bold text-slate-700">
                      {entry.type === PlayType.TEST ? 'Test' : 'Övning'} - {entry.score}/{entry.total}
                    </span>
                    <span className="block text-[10px] text-slate-400 uppercase font-bold">{entry.date}</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className={`text-sm font-black ${entry.isPassed ? 'text-emerald-500' : 'text-slate-400'}`}>
                    {entry.isPassed ? 'GODKÄND' : `${entry.points}p`}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <button 
            onClick={() => setHistory([])}
            className="mt-4 text-xs text-slate-400 hover:text-red-400 transition-colors font-bold uppercase tracking-widest"
          >
            Rensa historik
          </button>
        </div>
      )}
    </div>
  );

  const renderPracticeSetup = () => (
    <div className="flex flex-col items-center space-y-8 py-8">
      <div className="text-center">
        <h2 className="text-3xl font-bold text-slate-900">Vilka tabeller vill du {playType === PlayType.TEST ? 'testa' : 'öva'}?</h2>
        <p className="text-slate-500 mt-2">Välj en eller flera tabeller mellan 1 och 10.</p>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(t => (
          <div key={t} className="relative group">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => toggleTable(t)}
              style={{ 
                backgroundColor: selectedTables.includes(t) ? tableColors[t] : 'white',
                borderColor: selectedTables.includes(t) ? tableColors[t] : '#f1f5f9',
                color: selectedTables.includes(t) ? 'white' : '#475569'
              }}
              className={`w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold border-2 transition-all shadow-sm`}
            >
              {t}
            </motion.button>
            <button
              onClick={(e) => cycleTableColor(t, e)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md border border-slate-100 flex items-center justify-center text-slate-400 hover:text-indigo-500 transition-colors z-10"
              title="Ändra färg"
            >
              <Settings size={12} />
            </button>
          </div>
        ))}
      </div>

      <div className="flex space-x-4">
        <button 
          onClick={() => setMode(GameMode.MENU)}
          className="px-6 py-3 bg-slate-100 text-slate-600 rounded-xl font-semibold hover:bg-slate-200 transition-colors"
        >
          Avbryt
        </button>
        <button 
          disabled={selectedTables.length === 0}
          onClick={() => startSession(playType, selectedTables)}
          className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-semibold hover:bg-emerald-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          <span>Starta {playType === PlayType.TEST ? 'testet' : 'övningen'}</span>
          <ChevronRight size={20} />
        </button>
      </div>
    </div>
  );

  const renderPlaying = () => {
    const currentQ = questions[currentIndex];
    if (!currentQ) return null;

    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-12">
        {/* Header Info */}
        <div className="w-full max-w-md flex items-center justify-between px-4">
          <div className="flex items-center space-x-2 text-slate-500 font-medium">
            <GraduationCap size={20} />
            <span>Fråga {currentIndex + 1} av {questions.length}</span>
          </div>
          {playType === PlayType.TEST && (
            <div className="flex items-center space-x-2 text-indigo-600 font-bold bg-indigo-50 px-3 py-1 rounded-full">
              <Trophy size={16} />
              <span>Testläge</span>
            </div>
          )}
        </div>

        {/* Question Card */}
        <motion.div 
          key={currentIndex}
          initial={{ opacity: 0, scale: 0.8, rotateY: -20 }}
          animate={{ 
            opacity: 1, 
            scale: showFeedback && feedbackType === 'correct' ? [1, 1.05, 1] : 1, 
            rotateY: 0,
            x: showFeedback && (feedbackType === 'wrong' || feedbackType === 'timeout') ? [0, -15, 15, -15, 15, 0] : 0,
            backgroundColor: showFeedback 
              ? feedbackType === 'correct' ? '#ecfdf5' : '#fef2f2'
              : '#ffffff'
          }}
          transition={{ 
            type: 'spring', 
            stiffness: 300, 
            damping: 20,
            x: { duration: 0.4 },
            scale: { duration: 0.3 }
          }}
          style={{ borderTopColor: tableColors[currentQ.table], borderTopWidth: '8px' }}
          className="relative w-full max-w-lg rounded-[32px] sm:rounded-[40px] shadow-2xl border border-slate-100 p-6 sm:p-10 md:p-12 flex flex-col items-center space-y-6 sm:space-y-8 overflow-hidden"
        >
          {/* Feedback Overlay */}
          <AnimatePresence>
            {showFeedback && (
              <motion.div
                initial={{ opacity: 0, scale: 0.5, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 1.5 }}
                className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
              >
                {feedbackType === 'correct' && (
                  <motion.div 
                    animate={{ rotate: [0, -10, 10, 0] }}
                    className="bg-emerald-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex items-center space-x-3"
                  >
                    <CheckCircle2 size={32} />
                    <span className="text-3xl font-black italic">RÄTT!</span>
                  </motion.div>
                )}
                {feedbackType === 'wrong' && (
                  <motion.div className="bg-red-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex flex-col items-center">
                    <div className="flex items-center space-x-3">
                      <XCircle size={32} />
                      <span className="text-3xl font-black italic">FEL!</span>
                    </div>
                    <span className="text-lg font-bold mt-2">Svaret är {currentQ.answer}</span>
                  </motion.div>
                )}
                {feedbackType === 'timeout' && (
                  <motion.div className="bg-orange-500 text-white px-8 py-4 rounded-2xl shadow-2xl flex flex-col items-center">
                    <div className="flex items-center space-x-3">
                      <Timer size={32} className="animate-bounce" />
                      <span className="text-3xl font-black italic">TIDEN UTE!</span>
                    </div>
                    <span className="text-lg font-bold mt-2">Svaret är {currentQ.answer}</span>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Timer Bar - Only in Test */}
          {playType === PlayType.TEST && (
            <div className="absolute top-0 left-0 w-full h-2 bg-slate-100">
              <motion.div 
                className={`h-full ${timeLeft < 2 ? 'bg-red-500' : 'bg-emerald-500'}`}
                initial={{ width: '100%' }}
                animate={{ width: `${(timeLeft / MAX_TIME_PER_QUESTION) * 100}%` }}
                transition={{ duration: 0.1, ease: 'linear' }}
              />
            </div>
          )}

          <div className="flex items-center space-x-4 sm:space-x-8 text-5xl sm:text-7xl md:text-8xl font-black text-slate-900 tracking-tighter">
            <span>{currentQ.a}</span>
            <span className="text-slate-300">×</span>
            <span>{currentQ.b}</span>
            <span className="text-slate-300">=</span>
          </div>

          <div className="w-full max-w-xs relative">
            <input
              autoFocus
              type="number"
              value={userInput}
              onChange={(e) => {
                setUserInput(e.target.value);
                if (parseInt(e.target.value) === currentQ.answer) {
                  handleAnswer(parseInt(e.target.value));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && userInput !== '') {
                  handleAnswer(parseInt(userInput));
                }
              }}
              disabled={showFeedback}
              className={`w-full text-center text-4xl sm:text-5xl font-bold py-3 sm:py-4 rounded-2xl border-4 transition-all focus:outline-none ${
                showFeedback 
                  ? feedbackType === 'correct'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-600' 
                    : 'border-red-500 bg-red-50 text-red-600'
                  : 'border-slate-200 focus:border-indigo-500 text-slate-800'
              }`}
              placeholder="?"
            />
            
            <AnimatePresence>
              {showFeedback && !lastFeedback?.isCorrect && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -bottom-10 left-0 w-full text-center text-red-500 font-bold text-xl"
                >
                  Rätt svar: {lastFeedback?.correctAnswer}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {playType === PlayType.TEST && (
            <div className="flex items-center space-x-2 text-slate-400">
              <Timer size={18} />
              <span className="font-mono text-lg">{timeLeft.toFixed(1)}s</span>
            </div>
          )}
        </motion.div>

        {/* Numpad for touch devices */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-xs">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(num => (
            <motion.button
              key={num}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                if (showFeedback) return;
                const newVal = userInput + num;
                setUserInput(newVal);
                if (parseInt(newVal) === currentQ.answer) {
                  handleAnswer(parseInt(newVal));
                }
              }}
              className="h-16 bg-white border border-slate-200 rounded-xl text-2xl font-bold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
            >
              {num}
            </motion.button>
          ))}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setUserInput('')}
            className="h-16 bg-slate-100 rounded-xl text-xl font-bold text-slate-500 hover:bg-slate-200 active:scale-95 transition-all"
          >
            C
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => handleAnswer(parseInt(userInput))}
            className="h-16 bg-indigo-500 rounded-xl text-white font-bold hover:bg-indigo-600 active:scale-95 transition-all"
          >
            OK
          </motion.button>
        </div>
      </div>
    );
  };

  const renderResults = () => {
    if (!stats) return null;

    const chartData = [
      { name: 'Ditt resultat', value: playType === PlayType.TEST ? stats.totalCorrect : stats.totalCorrect },
      { name: 'Godkänd gräns', value: PASS_SCORE_THRESHOLD }
    ];

    const speedData = [
      { name: 'Din snabbhet', value: stats.totalPoints },
      { name: 'Godkänd gräns', value: PASS_SPEED_THRESHOLD }
    ];

    return (
      <div className="flex flex-col items-center space-y-12 py-8 max-w-4xl mx-auto px-4">
        {/* Hero Result */}
        <div className={`w-full text-center p-6 sm:p-10 md:p-12 rounded-[32px] sm:rounded-[40px] shadow-xl border-4 ${
          isPassed ? 'bg-emerald-50 border-emerald-500' : 'bg-white border-slate-100'
        }`}>
          {isPassed ? (
            <div className="space-y-4 sm:space-y-6">
              <div className="inline-flex items-center justify-center p-4 sm:p-6 bg-emerald-500 text-white rounded-full shadow-lg">
                <CheckCircle2 size={48} className="sm:w-16 sm:h-16" />
              </div>
              <h2 className="text-3xl sm:text-5xl font-black text-emerald-600 tracking-tight">DU ÄR GODKÄND!</h2>
              <p className="text-emerald-700 text-xl sm:text-2xl font-medium">Visa detta för din lärare nu! 🌟</p>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-6">
              <div className="inline-flex items-center justify-center p-4 sm:p-6 bg-slate-100 text-slate-400 rounded-full">
                <RotateCcw size={48} className="sm:w-16 sm:h-16" />
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-slate-800">Bra kämpat!</h2>
              <p className="text-slate-500 text-lg sm:text-xl">Du behöver lite mer träning för att nå hela vägen.</p>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
                <CheckCircle2 className="text-emerald-500" size={24} />
                <span>Antal rätt</span>
              </h3>
              <span className="text-3xl font-black text-slate-900">{stats.totalCorrect} / {questions.length}</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis hide domain={[0, questions.length]} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? (isPassed ? '#10b981' : '#6366f1') : '#e2e8f0'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
                <Timer className="text-indigo-500" size={24} />
                <span>Snabbhetspoäng</span>
              </h3>
              <span className="text-3xl font-black text-slate-900">{stats.totalPoints} / {questions.length * MAX_POINTS_PER_QUESTION}</span>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={speedData} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                  <YAxis hide domain={[0, questions.length * MAX_POINTS_PER_QUESTION]} />
                  <Tooltip cursor={{ fill: 'transparent' }} />
                  <Bar dataKey="value" radius={[8, 8, 0, 0]} barSize={60}>
                    {speedData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? (isPassed ? '#10b981' : '#6366f1') : '#e2e8f0'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Needs Practice & Wrong Answers */}
        <div className="w-full space-y-8">
          {stats.needsPractice.length > 0 && (
            <div className="bg-orange-50 p-8 rounded-3xl border border-orange-100">
              <h3 className="text-xl font-bold text-orange-800 mb-4 flex items-center space-x-2">
                <Settings size={24} />
                <span>Tabeller du behöver träna mer på:</span>
              </h3>
              <div className="flex flex-wrap gap-3">
                {stats.needsPractice.map(t => (
                  <span key={t} className="px-6 py-2 bg-white text-orange-600 font-bold rounded-xl border border-orange-200 shadow-sm">
                    {t}:ans tabell
                  </span>
                ))}
              </div>
            </div>
          )}

          {stats.wrongAnswers.length > 0 && (
            <div className="bg-red-50 p-8 rounded-3xl border border-red-100">
              <h3 className="text-xl font-bold text-red-800 mb-4 flex items-center space-x-2">
                <XCircle size={24} />
                <span>Frågor du svarade fel på:</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                {stats.wrongAnswers.map((r, i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-red-100 shadow-sm flex flex-col items-center">
                    <span className="text-slate-400 text-xs mb-1">Fråga {results.indexOf(r) + 1}</span>
                    <span className="text-xl font-bold text-slate-800">{r.question.a} × {r.question.b} = {r.question.answer}</span>
                    <span className="text-xs text-red-500 mt-1">Ditt svar: {r.userAnswer === null ? 'Inget' : r.userAnswer}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex space-x-4">
          <button 
            onClick={() => setMode(GameMode.MENU)}
            className="px-10 py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all flex items-center space-x-2 shadow-lg hover:shadow-xl active:scale-95"
          >
            <RotateCcw size={20} />
            <span>Tillbaka till menyn</span>
          </button>
        </div>
      </div>
    );
  };

  const getBackgroundGradient = () => {
    if (mode === GameMode.MENU) {
      return 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';
    }
    
    if (mode === GameMode.PRACTICE_SETUP) {
      if (selectedTables.length > 0) {
        const lastTable = selectedTables[selectedTables.length - 1];
        const color = tableColors[lastTable];
        return `linear-gradient(135deg, #ffffff 0%, ${lightenColor(color, 0.8)} 100%)`;
      }
      return 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';
    }
    
    if (mode === GameMode.PLAYING) {
      const currentQ = questions[currentIndex];
      if (!currentQ) return 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';
      
      const color = tableColors[currentQ.table];
      const progress = currentIndex / questions.length;
      
      if (showFeedback) {
        if (feedbackType === 'correct') return 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)';
        if (feedbackType === 'wrong' || feedbackType === 'timeout') return 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)';
      }
      
      // Dynamic mix of table color and progress
      const baseColor = lightenColor(color, 0.85);
      const accentColor = lightenColor(color, 0.7);
      
      return `linear-gradient(${135 + progress * 45}deg, ${baseColor} 0%, ${accentColor} 100%)`;
    }
    
    if (mode === GameMode.RESULTS) {
      if (isPassed) {
        return 'linear-gradient(135deg, #d1fae5 0%, #6ee7b7 100%)'; // Vibrant emerald
      }
      return 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)';
    }
    
    return 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';
  };

  return (
    <motion.div 
      animate={{ 
        background: getBackgroundGradient() 
      }}
      transition={{ duration: 1 }}
      className="min-h-screen font-sans text-slate-900"
    >
      {/* Navigation / Header */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 py-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setMode(GameMode.MENU)}>
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center text-white shadow-sm">
              <School size={24} />
            </div>
            <div>
              <span className="font-black text-xl tracking-tight">PLÖNNINGE</span>
              <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest -mt-1">Multiplikation</span>
            </div>
          </div>
          
          {mode === GameMode.PLAYING && (
            <div className="hidden md:flex items-center space-x-6">
              <div className="flex items-center space-x-2 text-slate-500">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-sm font-semibold uppercase tracking-wider">Session pågår</span>
              </div>
            </div>
          )}
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            {mode === GameMode.MENU && renderMenu()}
            {mode === GameMode.PRACTICE_SETUP && renderPracticeSetup()}
            {mode === GameMode.PLAYING && renderPlaying()}
            {mode === GameMode.RESULTS && renderResults()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-100 mt-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between text-slate-400 text-sm">
          <p>© 2026 Plönningeskolan - Matematik är kul!</p>
          <div className="flex items-center space-x-4 mt-4 md:mt-0">
            <span>Utvecklad för mellanstadiet</span>
            <div className="w-1 h-1 rounded-full bg-slate-200" />
            <span>Version 1.0</span>
          </div>
        </div>
      </footer>
    </motion.div>
  );
}
