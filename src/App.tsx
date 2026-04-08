import React, { useState, useEffect, useRef } from 'react';
import { 
  Users, 
  Calendar, 
  Settings, 
  Plus, 
  Search, 
  FileText, 
  Save, 
  FolderOpen, 
  Download, 
  Trash2, 
  Edit2, 
  ChevronRight,
  Sparkles,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Student, Session, TabType } from './types';
import { summarizeSession } from './lib/gemini';
import { auth, db, loginWithGoogle, logout } from './firebase';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc,
  orderBy
} from 'firebase/firestore';

// --- Utils ---
const pad = (n: number) => String(n).padStart(2, '0');
const todayStr = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};
const formatDate = (s: string) => {
  if (!s) return '';
  const p = s.split('-');
  if (p.length !== 3) return s;
  return `${p[0]}.${p[1]}.${p[2]}`;
};

export default function App() {
  // --- Auth State ---
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // --- State ---
  const [students, setStudents] = useState<Student[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [techniques, setTechniques] = useState<string[]>(["호흡 재설정", "목소리 레이어링", "거울 피드백", "공명 훈련", "억양 패턴"]);
  const [levels, setLevels] = useState<string[]>(["Basic", "Master", "First Class"]);
  
  const [activeTab, setActiveTab] = useState<TabType>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  
  // Modals
  const [isStudentModalOpen, setIsStudentModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [isSessionModalOpen, setIsSessionModalOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<Session | null>(null);
  
  // Session Form
  const [sessionStudentId, setSessionStudentId] = useState('');
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [freeText, setFreeText] = useState('');
  const [aiSummary, setAiSummary] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [selectedTechs, setSelectedTechs] = useState<string[]>([]);
  const [reaction, setReaction] = useState('');
  const [nextStep, setNextStep] = useState('');

  // --- Firebase Auth & Sync ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setStudents([]);
      setSessions([]);
      return;
    }

    // Sync Students
    const qStudents = query(collection(db, 'students'), where('ownerId', '==', user.uid));
    const unsubStudents = onSnapshot(qStudents, (snapshot) => {
      setStudents(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Student)));
    });

    // Sync Sessions
    const qSessions = query(collection(db, 'sessions'), where('ownerId', '==', user.uid), orderBy('num', 'desc'));
    const unsubSessions = onSnapshot(qSessions, (snapshot) => {
      setSessions(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Session)));
    });

    // Sync Config
    const unsubConfig = onSnapshot(doc(db, 'configs', user.uid), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.techniques) setTechniques(data.techniques);
        if (data.levels) setLevels(data.levels);
      }
    });

    return () => {
      unsubStudents();
      unsubSessions();
      unsubConfig();
    };
  }, [user]);

  // --- Handlers ---
  const handleAddStudent = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) return;
    const formData = new FormData(e.currentTarget);
    const studentData = {
      name: formData.get('name') as string,
      goal: formData.get('goal') as string,
      startDate: formData.get('startDate') as string,
      level: formData.get('level') as string,
      pattern: formData.get('pattern') as string,
      ownerId: user.uid
    };

    try {
      if (editingStudent) {
        await updateDoc(doc(db, 'students', editingStudent.id), studentData);
      } else {
        const docRef = await addDoc(collection(db, 'students'), studentData);
        setSelectedStudentId(docRef.id);
      }
      setIsStudentModalOpen(false);
      setEditingStudent(null);
    } catch (err) {
      console.error("Error saving student:", err);
      alert("수강생 저장 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (window.confirm('수강생을 삭제할까요? 세션 기록도 함께 삭제됩니다.')) {
      try {
        await deleteDoc(doc(db, 'students', id));
        // Also delete sessions for this student
        const studentSessions = sessions.filter(s => s.studentId === id);
        for (const s of studentSessions) {
          await deleteDoc(doc(db, 'sessions', s.id));
        }
        if (selectedStudentId === id) setSelectedStudentId(null);
      } catch (err) {
        console.error("Error deleting student:", err);
      }
    }
  };

  const handleSaveSession = async () => {
    if (!user || !sessionStudentId) return alert('수강생을 선택해주세요.');
    const studentSessions = sessions.filter(s => s.studentId === sessionStudentId);
    const sessionData = {
      studentId: sessionStudentId,
      num: studentSessions.length + 1,
      date: sessionDate,
      reaction: reaction || freeText,
      next: nextStep,
      techniques: selectedTechs,
      aiSummary: aiSummary,
      mode: 'text',
      ownerId: user.uid
    };

    try {
      await addDoc(collection(db, 'sessions'), sessionData);
      alert('세션이 저장되었습니다.');
      
      // Reset form
      setAiSummary('');
      setFreeText('');
      setSelectedTechs([]);
      setReaction('');
      setNextStep('');
      setActiveTab('list');
      setSelectedStudentId(sessionStudentId);
    } catch (err) {
      console.error("Error saving session:", err);
      alert("세션 저장 중 오류가 발생했습니다.");
    }
  };

  const handleUpdateSession = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user || !editingSession) return;
    const formData = new FormData(e.currentTarget);
    
    const updatedData = {
      reaction: formData.get('reaction') as string,
      next: formData.get('next') as string,
      aiSummary: formData.get('aiSummary') as string,
    };

    try {
      await updateDoc(doc(db, 'sessions', editingSession.id), updatedData);
      setIsSessionModalOpen(false);
      setEditingSession(null);
    } catch (err) {
      console.error("Error updating session:", err);
      alert("세션 수정 중 오류가 발생했습니다.");
    }
  };

  const handleDeleteSession = async (id: string) => {
    if (window.confirm('이 세션 기록을 삭제할까요?')) {
      try {
        await deleteDoc(doc(db, 'sessions', id));
        setIsSessionModalOpen(false);
        setEditingSession(null);
      } catch (err) {
        console.error("Error deleting session:", err);
      }
    }
  };

  const updateConfig = async (newTechs: string[], newLevels: string[]) => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'configs', user.uid), {
        techniques: newTechs,
        levels: newLevels,
        ownerId: user.uid
      });
    } catch (err) {
      console.error("Error updating config:", err);
    }
  };

  const handleRunAI = async () => {
    const content = freeText;
    if (!content) return alert('내용을 입력해주세요.');
    
    const student = students.find(s => s.id === sessionStudentId);
    if (!student) return alert('수강생을 선택해주세요.');

    setIsAiLoading(true);
    try {
      const summary = await summarizeSession(student.name, sessions.filter(s => s.studentId === sessionStudentId).length + 1, content);
      setAiSummary(summary);
      setReaction(content);
    } catch (error) {
      alert('AI 요약 중 오류가 발생했습니다.');
    } finally {
      setIsAiLoading(false);
    }
  };

  const exportJSON = () => {
    const data = JSON.stringify({ students, sessions, techniques, levels }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ncc_backup_${todayStr()}.json`;
    a.click();
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data.students) setStudents(data.students);
        if (data.sessions) setSessions(data.sessions);
        if (data.techniques) setTechniques(data.techniques);
        if (data.levels) setLevels(data.levels);
        alert('데이터를 성공적으로 불러왔습니다.');
      } catch (err) {
        alert('파일 형식이 올바르지 않습니다.');
      }
    };
    reader.readAsText(file);
  };

  // --- Filtered Data ---
  const filteredStudents = students.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedStudent = students.find(s => s.id === selectedStudentId);
  const studentSessions = sessions
    .filter(s => s.studentId === selectedStudentId)
    .sort((a, b) => b.num - a.num);

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f2]">
        <div className="w-8 h-8 border-4 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f5f5f2] p-6">
        <div className="w-16 h-16 rounded-2xl bg-teal-500 flex items-center justify-center text-white mb-6 shadow-lg shadow-teal-500/20">
          <Users size={32} />
        </div>
        <h1 className="text-2xl font-bold mb-2">NCC 수강생 관리</h1>
        <p className="text-black/40 mb-8 text-center max-w-xs">마음이발소 코칭 기록 시스템에 로그인하여 데이터를 안전하게 보관하세요.</p>
        <button 
          onClick={loginWithGoogle}
          className="btn btn-primary px-8 py-3 text-base shadow-lg shadow-teal-500/20"
        >
          Google로 시작하기
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-black/5 px-6 py-4 sticky top-0 z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                <h1 className="text-lg font-bold tracking-tight">NCC 수강생 관리</h1>
              </div>
              <p className="text-xs text-black/40 mt-0.5 font-medium">마음이발소 코칭 기록 시스템</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-black/5 rounded-lg">
              <img src={user.photoURL || ''} alt="" className="w-5 h-5 rounded-full" />
              <span className="text-xs font-medium">{user.displayName}</span>
            </div>
            <button onClick={logout} className="text-xs text-black/40 hover:text-black/60 font-medium">로그아웃</button>
            <button 
              onClick={() => { setEditingStudent(null); setIsStudentModalOpen(true); }}
              className="btn btn-primary"
            >
              <Plus size={16} />
              수강생 추가
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6">
        {/* Data Bar */}
        <div className="flex items-center gap-3 mb-6 p-3 bg-white border border-black/5 rounded-xl">
          <span className="text-[11px] font-bold text-black/30 uppercase tracking-wider ml-1">Data</span>
          <button onClick={exportJSON} className="btn btn-sm text-xs py-1 px-3">
            <Save size={14} /> 저장
          </button>
          <label className="btn btn-sm text-xs py-1 px-3 cursor-pointer">
            <FolderOpen size={14} /> 불러오기
            <input type="file" className="hidden" accept=".json" onChange={importJSON} />
          </label>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-black/10 mb-8">
          {(['list', 'session', 'manage'] as TabType[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 py-3 text-sm font-medium transition-all relative ${
                activeTab === tab ? 'text-teal-600' : 'text-black/40 hover:text-black/60'
              }`}
            >
              {tab === 'list' && '수강생 목록'}
              {tab === 'session' && '세션 기록'}
              {tab === 'manage' && '기법 · 단계 관리'}
              {activeTab === tab && (
                <motion.div 
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-teal-500"
                />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'list' && (
            <motion.div
              key="list"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-black/30" size={18} />
                <input 
                  type="text"
                  placeholder="수강생 이름으로 검색..."
                  className="form-input pl-10 py-3 text-base"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Student Grid */}
                <div className="md:col-span-1 space-y-3">
                  {filteredStudents.length === 0 ? (
                    <div className="text-center py-12 border-2 border-dashed border-black/5 rounded-xl">
                      <p className="text-sm text-black/30">수강생이 없습니다.</p>
                    </div>
                  ) : (
                    filteredStudents.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedStudentId(s.id)}
                        className={`w-full text-left p-4 rounded-xl border transition-all ${
                          selectedStudentId === s.id 
                            ? 'bg-teal-50 border-teal-200 shadow-sm' 
                            : 'bg-white border-black/5 hover:border-teal-200'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                            {s.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-bold text-sm">{s.name}</div>
                            <div className="text-[11px] text-black/40 mt-0.5">{s.level}</div>
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>

                {/* Profile & Timeline */}
                <div className="md:col-span-2">
                  {selectedStudent ? (
                    <div className="space-y-6">
                      <div className="card">
                        <div className="flex items-start justify-between mb-6">
                          <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center text-xl font-bold">
                              {selectedStudent.name.charAt(0)}
                            </div>
                            <div>
                              <h2 className="text-xl font-bold">{selectedStudent.name}</h2>
                              <p className="text-sm text-black/60">{selectedStudent.goal}</p>
                              <div className="flex items-center gap-2 mt-2">
                                <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded uppercase tracking-wider">
                                  {selectedStudent.level}
                                </span>
                                <span className="text-[11px] text-black/30">
                                  수강시작 {formatDate(selectedStudent.startDate)}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <button 
                              onClick={() => { setEditingStudent(selectedStudent); setIsStudentModalOpen(true); }}
                              className="p-2 text-black/40 hover:text-teal-600 transition-colors"
                            >
                              <Edit2 size={18} />
                            </button>
                            <button 
                              onClick={() => handleDeleteStudent(selectedStudent.id)}
                              className="p-2 text-black/40 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                        
                        {selectedStudent.pattern && (
                          <div className="bg-black/5 p-4 rounded-lg mb-6">
                            <h4 className="text-[11px] font-bold text-black/30 uppercase tracking-wider mb-2">핵심 패턴 메모</h4>
                            <p className="text-sm leading-relaxed">{selectedStudent.pattern}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-4">
                          <div className="bg-[#f9f9f7] p-4 rounded-xl text-center">
                            <div className="text-2xl font-bold text-teal-600">{studentSessions.length}</div>
                            <div className="text-[10px] text-black/40 font-bold uppercase mt-1">총 세션 수</div>
                          </div>
                          <div className="bg-[#f9f9f7] p-4 rounded-xl text-center">
                            <div className="text-sm font-bold">
                              {studentSessions.length > 0 ? formatDate(studentSessions[0].date) : '—'}
                            </div>
                            <div className="text-[10px] text-black/40 font-bold uppercase mt-1">최근 세션</div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <h3 className="font-bold flex items-center gap-2">
                          세션 기록
                          <span className="text-xs font-normal text-black/30">({studentSessions.length}회기 누적)</span>
                        </h3>
                        <button 
                          onClick={() => {
                            setSessionStudentId(selectedStudent.id);
                            setActiveTab('session');
                          }}
                          className="btn btn-sm btn-primary py-1.5"
                        >
                          <Plus size={14} /> 세션 추가
                        </button>
                      </div>

                      <div className="space-y-4 relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-black/5">
                        {studentSessions.length === 0 ? (
                          <p className="text-sm text-black/30 py-4">아직 세션 기록이 없습니다.</p>
                        ) : (
                          studentSessions.map((sess) => (
                            <button 
                              key={sess.id} 
                              onClick={() => {
                                setEditingSession(sess);
                                setIsSessionModalOpen(true);
                              }}
                              className="w-full text-left relative group"
                            >
                              <div className="absolute -left-[22px] top-1.5 w-3 h-3 rounded-full bg-teal-500 border-2 border-white shadow-sm group-hover:scale-125 transition-transform" />
                              <div className="card p-4 hover:border-teal-200 transition-all hover:shadow-md">
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-3">
                                    <span className="text-sm font-bold text-teal-600">{sess.num}회기</span>
                                    <span className="text-xs text-black/30">{formatDate(sess.date)}</span>
                                  </div>
                                  <div className="text-black/20">
                                    <FileText size={14} />
                                  </div>
                                </div>
                                
                                 <div className="space-y-4">
                                  {/* AI Summary (Primary view) */}
                                  {sess.aiSummary ? (
                                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-black/80">
                                      {sess.aiSummary}
                                    </div>
                                  ) : (
                                    <div className="text-sm leading-relaxed whitespace-pre-wrap text-black/40 italic">
                                      {sess.reaction.substring(0, 100)}{sess.reaction.length > 100 ? '...' : ''}
                                      <p className="text-[10px] mt-1 not-italic">(요약 없음 - 클릭하여 전체 보기)</p>
                                    </div>
                                  )}
                                </div>

                                <div className="flex flex-wrap gap-1.5 mt-3">
                                  {sess.techniques.map(t => (
                                    <span key={t} className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded">
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center py-20 text-black/20">
                      <Users size={48} strokeWidth={1} />
                      <p className="mt-4 text-sm">수강생을 선택하여 프로필을 확인하세요.</p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'session' && (
            <motion.div
              key="session"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">수강생 선택</label>
                  <select 
                    className="form-input h-11"
                    value={sessionStudentId}
                    onChange={(e) => setSessionStudentId(e.target.value)}
                  >
                    <option value="">수강생을 선택하세요</option>
                    {students.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">세션 날짜</label>
                  <input 
                    type="date"
                    className="form-input h-11"
                    value={sessionDate}
                    onChange={(e) => setSessionDate(e.target.value)}
                  />
                </div>
              </div>

              {sessionStudentId && (
                <p className="text-sm font-medium text-teal-600">
                  {students.find(s => s.id === sessionStudentId)?.name} — 이번이 {sessions.filter(s => s.studentId === sessionStudentId).length + 1}회기 세션입니다.
                </p>
              )}

              {/* Input Panel */}
              <div className="card">
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-black/40 uppercase tracking-wider">세션 내용 입력</label>
                    <textarea 
                      className="form-input min-h-[150px] resize-none"
                      placeholder="오늘 진행한 상담/코칭 내용을 자유롭게 입력하세요. (예: 오늘 3회기. 공명 훈련 위주. 학생이 복식호흡 처음 성공.)"
                      value={freeText}
                      onChange={(e) => setFreeText(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] text-black/30">AI 정리는 선택 사항입니다. 내용을 입력하고 버튼을 누르면 요약이 생성됩니다.</p>
                    <button 
                      onClick={handleRunAI}
                      disabled={isAiLoading}
                      className="btn btn-sm bg-teal-50 text-teal-600 border border-teal-100 hover:bg-teal-100"
                    >
                      {isAiLoading ? (
                        <>
                          <div className="w-3 h-3 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mr-1" />
                          정리 중...
                        </>
                      ) : (
                        <>
                          <Sparkles size={14} className="mr-1" />
                          AI로 요약하기
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {aiSummary && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-6 pt-6 border-t border-black/5"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles size={14} className="text-teal-500" />
                      <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wider">AI 정리 결과</span>
                    </div>
                    <div className="bg-teal-50 p-4 rounded-xl text-sm leading-relaxed text-teal-800 whitespace-pre-wrap">
                      {aiSummary}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Common Fields */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">사용한 NCC 기법</label>
                  <div className="flex flex-wrap gap-2">
                    {techniques.map(tech => (
                      <button
                        key={tech}
                        onClick={() => {
                          setSelectedTechs(prev => 
                            prev.includes(tech) ? prev.filter(t => t !== tech) : [...prev, tech]
                          );
                        }}
                        className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                          selectedTechs.includes(tech)
                            ? 'bg-teal-50 border-teal-500 text-teal-700'
                            : 'bg-white border-black/10 text-black/60 hover:border-teal-200'
                        }`}
                      >
                        {tech}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">학생 반응 · 변화</label>
                  <textarea 
                    className="form-input min-h-[80px]"
                    placeholder="오늘 눈에 띈 변화나 반응"
                    value={reaction}
                    onChange={(e) => setReaction(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">다음 세션 방향</label>
                  <textarea 
                    className="form-input min-h-[80px]"
                    placeholder="다음에 집중할 포인트"
                    value={nextStep}
                    onChange={(e) => setNextStep(e.target.value)}
                  />
                </div>

                <button 
                  onClick={handleSaveSession}
                  className="btn btn-primary w-full py-4 text-base font-bold shadow-lg shadow-teal-500/20"
                >
                  세션 저장
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'manage' && (
            <motion.div
              key="manage"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-10"
            >
              <div className="space-y-6">
                <h3 className="font-bold text-lg">NCC 기법 관리</h3>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    id="new-tech"
                    placeholder="기법명 입력"
                    className="form-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && !techniques.includes(val)) {
                          setTechniques([...techniques, val]);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('new-tech') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !techniques.includes(val)) {
                        setTechniques([...techniques, val]);
                        input.value = '';
                      }
                    }}
                    className="btn btn-primary"
                  >추가</button>
                </div>
                <div className="space-y-2">
                  {techniques.map((tech, idx) => (
                    <div key={tech} className="flex items-center justify-between p-3 bg-white border border-black/5 rounded-lg">
                      <span className="text-sm font-medium">{tech}</span>
                      <button 
                        onClick={() => {
                          const newTechs = techniques.filter((_, i) => i !== idx);
                          setTechniques(newTechs);
                          updateConfig(newTechs, levels);
                        }}
                        className="text-black/20 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-6">
                <h3 className="font-bold text-lg">NCC 단계 관리</h3>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    id="new-level"
                    placeholder="단계명 입력"
                    className="form-input"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const val = e.currentTarget.value.trim();
                        if (val && !levels.includes(val)) {
                          const newLevels = [...levels, val];
                          setLevels(newLevels);
                          updateConfig(techniques, newLevels);
                          e.currentTarget.value = '';
                        }
                      }
                    }}
                  />
                  <button 
                    onClick={() => {
                      const input = document.getElementById('new-level') as HTMLInputElement;
                      const val = input.value.trim();
                      if (val && !levels.includes(val)) {
                        const newLevels = [...levels, val];
                        setLevels(newLevels);
                        updateConfig(techniques, newLevels);
                        input.value = '';
                      }
                    }}
                    className="btn btn-primary"
                  >추가</button>
                </div>
                <div className="space-y-2">
                  {levels.map((level, idx) => (
                    <div key={level} className="flex items-center justify-between p-3 bg-white border border-black/5 rounded-lg">
                      <span className="text-sm font-medium">{level}</span>
                      <button 
                        onClick={() => {
                          const newLevels = levels.filter((_, i) => i !== idx);
                          setLevels(newLevels);
                          updateConfig(techniques, newLevels);
                        }}
                        className="text-black/20 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Student Modal */}
      <AnimatePresence>
        {isStudentModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsStudentModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
                <h3 className="font-bold">{editingStudent ? '수강생 편집' : '수강생 추가'}</h3>
                <button onClick={() => setIsStudentModalOpen(false)} className="text-black/30 hover:text-black/60">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleAddStudent} className="p-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">이름 *</label>
                  <input 
                    name="name"
                    required
                    defaultValue={editingStudent?.name}
                    placeholder="수강생 이름"
                    className="form-input h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">수강 시작일</label>
                  <input 
                    name="startDate"
                    type="date"
                    defaultValue={editingStudent?.startDate || todayStr()}
                    className="form-input h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">코칭 목적 / 목표</label>
                  <input 
                    name="goal"
                    defaultValue={editingStudent?.goal}
                    placeholder="예: 발표 불안 해소, 목소리 자신감"
                    className="form-input h-11"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">NCC 단계</label>
                  <select name="level" defaultValue={editingStudent?.level || levels[0]} className="form-input h-11">
                    {levels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">핵심 패턴 메모 (소장님 전용)</label>
                  <textarea 
                    name="pattern"
                    defaultValue={editingStudent?.pattern}
                    placeholder="이 학생만의 반복 습관, 특이사항, 주의점"
                    className="form-input min-h-[100px] resize-none"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setIsStudentModalOpen(false)} className="btn flex-1 py-3">취소</button>
                  <button type="submit" className="btn btn-primary flex-1 py-3">저장</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Session Modal */}
      <AnimatePresence>
        {isSessionModalOpen && editingSession && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSessionModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
                <div>
                  <h3 className="font-bold">{editingSession.num}회기 세션 기록 상세</h3>
                  <p className="text-[11px] text-black/40">{formatDate(editingSession.date)}</p>
                </div>
                <button onClick={() => setIsSessionModalOpen(false)} className="text-black/30 hover:text-black/60">
                  <X size={20} />
                </button>
              </div>
              <form onSubmit={handleUpdateSession} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">작성한 원문 (수정 가능)</label>
                  <textarea 
                    name="reaction"
                    defaultValue={editingSession.reaction}
                    className="form-input min-h-[200px] text-sm leading-relaxed"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">AI 요약 결과 (수정 가능)</label>
                  <textarea 
                    name="aiSummary"
                    defaultValue={editingSession.aiSummary}
                    placeholder="AI 요약이 없습니다."
                    className="form-input min-h-[150px] text-sm leading-relaxed bg-teal-50/30"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-black/40 uppercase tracking-wider">다음 세션 방향</label>
                  <textarea 
                    name="next"
                    defaultValue={editingSession.next}
                    className="form-input min-h-[80px]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button 
                    type="button" 
                    onClick={() => handleDeleteSession(editingSession.id)}
                    className="btn border-red-100 text-red-500 hover:bg-red-50 px-4"
                  >
                    <Trash2 size={18} />
                  </button>
                  <button type="button" onClick={() => setIsSessionModalOpen(false)} className="btn flex-1 py-3">취소</button>
                  <button type="submit" className="btn btn-primary flex-1 py-3">수정 사항 저장</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
