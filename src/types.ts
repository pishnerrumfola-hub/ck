export interface VocabularyWord {
  id: string;
  word: string;
  phonetic: string;
  translation: string;
  sentence: string;
  sentenceTranslation: string;
  createdAt: number;
}

export interface WordBook {
  id: string;
  name: string;
  words: VocabularyWord[];
  isDefault?: boolean;
}

export interface WrongWord {
  id: string; // matches the word's id or its lowercase value as key
  word: string;
  phonetic: string;
  translation: string;
  sentence: string;
  sentenceTranslation: string;
  errorCount: number;
  lastTestedAt: number;
  history?: {
    typed: string;
    timestamp: number;
  }[];
}

export interface DictationSession {
  bookId: string; // WordBook id, or 'wrong' for mistake reinforcement, or 'all'
  words: VocabularyWord[];
  shuffled: boolean;
  currentIndex: number;
  status: "idle" | "running" | "completed";
  results: {
    wordId: string;
    word: string;
    typed: string;
    isCorrect: boolean;
    hintsUsed: ("phonetic" | "translation" | "sentence")[];
  }[];
  startedAt: number;
  completedAt?: number;
}
