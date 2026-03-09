"use client";

import { useState } from "react";
import { X, ArrowRight, ArrowLeft, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "rb-style-quiz";

interface QuizAnswer {
  vibe: string;
  fit: string;
  colors: string[];
  budget: string;
}

const QUESTIONS = [
  {
    key: "vibe" as const,
    title: "What's your vibe?",
    subtitle: "Pick the style that speaks to you",
    options: [
      { value: "casual", label: "Casual", emoji: "👕" },
      { value: "streetwear", label: "Streetwear", emoji: "🧢" },
      { value: "athletic", label: "Athletic", emoji: "🏃" },
      { value: "smart-casual", label: "Smart Casual", emoji: "👔" },
    ],
    multi: false,
  },
  {
    key: "fit" as const,
    title: "Preferred fit?",
    subtitle: "How do you like your clothes to feel",
    options: [
      { value: "slim", label: "Slim", emoji: "📐" },
      { value: "regular", label: "Regular", emoji: "👌" },
      { value: "relaxed", label: "Relaxed", emoji: "🛋️" },
      { value: "oversized", label: "Oversized", emoji: "📦" },
    ],
    multi: false,
  },
  {
    key: "colors" as const,
    title: "Go-to colors?",
    subtitle: "Pick all that apply",
    options: [
      { value: "neutrals", label: "Neutrals", emoji: "⚪" },
      { value: "bold", label: "Bold & Bright", emoji: "🔴" },
      { value: "earth-tones", label: "Earth Tones", emoji: "🟤" },
      { value: "pastels", label: "Pastels", emoji: "🩷" },
    ],
    multi: true,
  },
  {
    key: "budget" as const,
    title: "Budget range?",
    subtitle: "Per item, roughly",
    options: [
      { value: "under-500", label: "Under ₱500", emoji: "💰" },
      { value: "500-1000", label: "₱500 - ₱1,000", emoji: "💵" },
      { value: "1000-2000", label: "₱1,000 - ₱2,000", emoji: "💎" },
      { value: "2000-plus", label: "₱2,000+", emoji: "👑" },
    ],
    multi: false,
  },
];

function getRecommendations(answers: QuizAnswer) {
  const recs: string[] = [];

  if (answers.vibe === "casual") recs.push("T-Shirts", "Jeans", "Shorts");
  else if (answers.vibe === "streetwear") recs.push("Hoodies", "Sneakers", "Caps");
  else if (answers.vibe === "athletic") recs.push("Active Wear", "Running Shoes", "Tank Tops");
  else recs.push("Polo Shirts", "Chinos", "Loafers");

  if (answers.colors.includes("bold")) recs.push("Statement Pieces");
  if (answers.fit === "oversized") recs.push("Oversized Tees");

  return [...new Set(recs)].slice(0, 5);
}

interface StyleQuizProps {
  open: boolean;
  onClose: () => void;
}

export function StyleQuiz({ open, onClose }: StyleQuizProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<QuizAnswer>({
    vibe: "",
    fit: "",
    colors: [],
    budget: "",
  });
  const [done, setDone] = useState(false);

  if (!open) return null;

  const question = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  function canProceed() {
    const q = QUESTIONS[step];
    if (q.multi) return (answers[q.key] as string[]).length > 0;
    return (answers[q.key] as string) !== "";
  }

  function handleSelect(value: string) {
    const q = QUESTIONS[step];
    if (q.multi) {
      setAnswers((prev) => {
        const arr = prev[q.key] as string[];
        const next = arr.includes(value)
          ? arr.filter((v) => v !== value)
          : [...arr, value];
        return { ...prev, [q.key]: next };
      });
    } else {
      setAnswers((prev) => ({ ...prev, [q.key]: value }));
    }
  }

  function handleNext() {
    if (!canProceed()) return;
    if (isLast) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
      setDone(true);
    } else {
      setStep(step + 1);
    }
  }

  function isSelected(value: string) {
    const q = QUESTIONS[step];
    if (q.multi) return (answers[q.key] as string[]).includes(value);
    return answers[q.key] === value;
  }

  const recommendations = done ? getRecommendations(answers) : [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-2xl bg-card border border-border shadow-2xl overflow-hidden">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>

        {!done ? (
          <div className="p-6">
            {/* Progress */}
            <div className="mb-6 flex gap-1">
              {QUESTIONS.map((_, i) => (
                <div
                  key={i}
                  className={cn(
                    "h-1 flex-1 rounded-full transition-colors",
                    i <= step ? "bg-primary" : "bg-muted"
                  )}
                />
              ))}
            </div>

            <div className="mb-1 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-bold">{question.title}</h2>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              {question.subtitle}
            </p>

            <div className="grid grid-cols-2 gap-3 mb-6">
              {question.options.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                    isSelected(opt.value)
                      ? "border-primary bg-primary/10 scale-[1.02]"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="text-2xl">{opt.emoji}</span>
                  <span className="text-sm font-medium">{opt.label}</span>
                  {isSelected(opt.value) && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-secondary"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canProceed()}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1 rounded-lg py-2.5 text-sm font-bold transition-all",
                  canProceed()
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "bg-muted text-muted-foreground cursor-not-allowed"
                )}
              >
                {isLast ? "See My Picks" : "Next"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <Sparkles className="mx-auto h-10 w-10 text-primary mb-3" />
            <h2 className="text-lg font-bold mb-1">Your Style Profile</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Based on your answers, we recommend:
            </p>
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {recommendations.map((rec) => (
                <span
                  key={rec}
                  className="rounded-full bg-primary/10 border border-primary/20 px-3 py-1.5 text-sm font-medium text-primary"
                >
                  {rec}
                </span>
              ))}
            </div>
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-primary py-2.5 text-sm font-bold text-primary-foreground hover:bg-primary/90"
            >
              Browse Picks
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
