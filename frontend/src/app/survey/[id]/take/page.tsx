"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import {
  getSurveyForTaking,
  startSurveySubmission,
  submitSurveyAnswer,
  completeSurveySubmission,
  submitSurveyPII,
  API_URL,
} from "@/lib/api";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import type { SurveyWithQuestions, SurveyQuestion, SurveySubmission } from "@/lib/types";

// Audio player component for question audio
function QuestionAudioPlayer({
  audioPath,
  autoPlay = true,
}: {
  audioPath: string | null;
  autoPlay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);

  useEffect(() => {
    // Reset when audio path changes (new question)
    setHasPlayed(false);
    setIsPlaying(false);
  }, [audioPath]);

  useEffect(() => {
    if (audioPath && autoPlay && !hasPlayed && audioRef.current) {
      // Small delay to allow UI to render first
      const timer = setTimeout(() => {
        audioRef.current?.play().catch(() => {
          // Auto-play may be blocked, user can click play manually
        });
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [audioPath, autoPlay, hasPlayed]);

  if (!audioPath) {
    return null;
  }

  // Construct the full URL for the audio file
  // Audio is served via /api/v1/audio/{bucket}/{path}
  // audioPath format is like "awdio/surveys/{id}/questions/{id}.wav" or "surveys/{id}/questions/{id}.wav"
  let audioUrl: string;
  if (audioPath.startsWith("http")) {
    audioUrl = audioPath;
  } else if (audioPath.startsWith("awdio/")) {
    // Already has bucket prefix
    audioUrl = `${API_URL}/api/v1/audio/${audioPath}`;
  } else {
    // Add bucket prefix
    audioUrl = `${API_URL}/api/v1/audio/awdio/${audioPath}`;
  }

  return (
    <div className="flex items-center gap-3 mb-4">
      <audio
        ref={audioRef}
        src={audioUrl}
        onPlay={() => {
          setIsPlaying(true);
          setHasPlayed(true);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        onClick={() => {
          if (audioRef.current) {
            if (isPlaying) {
              audioRef.current.pause();
            } else {
              audioRef.current.currentTime = 0;
              audioRef.current.play();
            }
          }
        }}
        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-colors ${
          isPlaying
            ? "bg-blue-500 text-white"
            : "bg-gray-700 hover:bg-gray-600 text-gray-300"
        }`}
      >
        {isPlaying ? (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
            <span>Pause</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span>{hasPlayed ? "Replay" : "Play"} question</span>
          </>
        )}
      </button>
      {isPlaying && (
        <div className="flex gap-1">
          <div className="w-1 h-4 bg-blue-400 rounded animate-pulse" style={{ animationDelay: "0ms" }} />
          <div className="w-1 h-4 bg-blue-400 rounded animate-pulse" style={{ animationDelay: "150ms" }} />
          <div className="w-1 h-4 bg-blue-400 rounded animate-pulse" style={{ animationDelay: "300ms" }} />
        </div>
      )}
    </div>
  );
}

// Voice input button component
function VoiceInputButton({
  onTranscript,
  disabled,
}: {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}) {
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const { isListening, isSupported, transcript, startListening, stopListening } =
    useSpeechRecognition({
      onResult: (text, isFinal) => {
        if (isFinal) {
          onTranscriptRef.current(text);
        }
      },
      continuous: false,
      interimResults: true,
    });

  if (!isSupported) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={isListening ? stopListening : startListening}
        disabled={disabled}
        className={`p-3 rounded-full transition-colors ${
          isListening
            ? "bg-red-500 animate-pulse"
            : "bg-gray-700 hover:bg-gray-600"
        } disabled:opacity-50`}
        title={isListening ? "Stop recording" : "Start voice input"}
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
          />
        </svg>
      </button>
      {isListening && transcript && (
        <span className="text-sm text-gray-400 italic">{transcript}...</span>
      )}
    </div>
  );
}

// Open text input with voice support - uses ref to avoid stale closure
function OpenTextInput({
  value,
  onChange,
  allowVoice,
  onVoiceTranscript,
}: {
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  allowVoice?: boolean;
  onVoiceTranscript?: (text: string) => void;
}) {
  const [localText, setLocalText] = useState((value.text as string) || "");
  const localTextRef = useRef(localText);
  localTextRef.current = localText;

  // Sync with external value changes
  useEffect(() => {
    const externalText = (value.text as string) || "";
    if (externalText !== localText) {
      setLocalText(externalText);
    }
  }, [value.text]);

  const handleTextChange = (newText: string) => {
    setLocalText(newText);
    onChange({ text: newText });
  };

  const handleVoiceTranscript = useCallback((text: string) => {
    const current = localTextRef.current;
    const newText = current ? `${current} ${text}` : text;
    setLocalText(newText);
    onChange({ text: newText });
    onVoiceTranscript?.(text);
  }, [onChange, onVoiceTranscript]);

  return (
    <div className="space-y-3">
      <textarea
        value={localText}
        onChange={(e) => handleTextChange(e.target.value)}
        className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none resize-none"
        rows={4}
        placeholder="Type your answer..."
      />
      {allowVoice && onVoiceTranscript && (
        <div className="flex items-center justify-center">
          <VoiceInputButton onTranscript={handleVoiceTranscript} />
          <span className="ml-2 text-sm text-gray-500">or speak your answer</span>
        </div>
      )}
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
  allowVoice,
  onVoiceTranscript,
}: {
  question: SurveyQuestion;
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
  allowVoice?: boolean;
  onVoiceTranscript?: (text: string) => void;
}) {
  switch (question.question_type) {
    case "single_choice":
      return (
        <div className="space-y-2">
          {question.options?.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                value.value === option.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-600 hover:border-gray-500"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                value={option.value}
                checked={value.value === option.value}
                onChange={() => onChange({ value: option.value })}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                  value.value === option.value
                    ? "border-blue-500"
                    : "border-gray-500"
                }`}
              >
                {value.value === option.value && (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                )}
              </div>
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );

    case "multiple_choice":
      const selectedValues = (value.values as string[]) || [];
      return (
        <div className="space-y-2">
          {question.options?.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedValues.includes(option.value)
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-600 hover:border-gray-500"
              }`}
            >
              <input
                type="checkbox"
                value={option.value}
                checked={selectedValues.includes(option.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    onChange({ values: [...selectedValues, option.value] });
                  } else {
                    onChange({
                      values: selectedValues.filter((v) => v !== option.value),
                    });
                  }
                }}
                className="sr-only"
              />
              <div
                className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                  selectedValues.includes(option.value)
                    ? "border-blue-500 bg-blue-500"
                    : "border-gray-500"
                }`}
              >
                {selectedValues.includes(option.value) && (
                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </div>
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );

    case "true_false":
      return (
        <div className="flex gap-4">
          {[
            { value: true, label: "True" },
            { value: false, label: "False" },
          ].map((option) => (
            <label
              key={String(option.value)}
              className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border cursor-pointer transition-colors ${
                value.value === option.value
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-gray-600 hover:border-gray-500"
              }`}
            >
              <input
                type="radio"
                name={question.id}
                checked={value.value === option.value}
                onChange={() => onChange({ value: option.value })}
                className="sr-only"
              />
              <span className="text-lg">{option.label}</span>
            </label>
          ))}
        </div>
      );

    case "rating":
      const ratingValue = (value.value as number) || 0;
      const maxRating = question.max_value || 5;
      return (
        <div>
          <div className="flex gap-2 justify-center">
            {Array.from({ length: maxRating }, (_, i) => i + 1).map((rating) => (
              <button
                key={rating}
                type="button"
                onClick={() => onChange({ value: rating })}
                className="p-2 transition-colors"
              >
                <svg
                  className={`w-10 h-10 ${
                    rating <= ratingValue ? "text-yellow-400" : "text-gray-600"
                  }`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </button>
            ))}
          </div>
          {question.min_label && question.max_label && (
            <div className="flex justify-between text-sm text-gray-500 mt-2">
              <span>{question.min_label}</span>
              <span>{question.max_label}</span>
            </div>
          )}
        </div>
      );

    case "scale":
      const scaleValue = value.value as number;
      const min = question.min_value || 1;
      const max = question.max_value || 10;
      return (
        <div>
          <div className="flex gap-2 justify-center flex-wrap">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => onChange({ value: num })}
                className={`w-12 h-12 rounded-lg border-2 font-medium transition-colors ${
                  scaleValue === num
                    ? "border-blue-500 bg-blue-500 text-white"
                    : "border-gray-600 hover:border-gray-500"
                }`}
              >
                {num}
              </button>
            ))}
          </div>
          {question.min_label && question.max_label && (
            <div className="flex justify-between text-sm text-gray-500 mt-2">
              <span>{question.min_label}</span>
              <span>{question.max_label}</span>
            </div>
          )}
        </div>
      );

    case "open_text":
      return (
        <OpenTextInput
          value={value}
          onChange={onChange}
          allowVoice={allowVoice}
          onVoiceTranscript={onVoiceTranscript}
        />
      );

    default:
      return null;
  }
}

function PIIForm({
  onSubmit,
  onSkip,
  submitting,
}: {
  onSubmit: (data: { name?: string; email?: string; company?: string }) => void;
  onSkip: () => void;
  submitting: boolean;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      name: name || undefined,
      email: email || undefined,
      company: company || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-gray-400 text-center mb-6">
        Would you like to share your contact information? (Optional)
      </p>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
          placeholder="Your name"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
          placeholder="your@email.com"
        />
      </div>
      <div>
        <label className="block text-sm text-gray-400 mb-1">Company</label>
        <input
          type="text"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
          className="w-full px-4 py-3 bg-gray-800 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
          placeholder="Your company"
        />
      </div>
      <div className="flex gap-3 pt-4">
        <button
          type="button"
          onClick={onSkip}
          disabled={submitting}
          className="flex-1 px-4 py-3 text-gray-400 hover:text-white transition-colors"
        >
          Skip
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  );
}

export default function TakeSurveyPage() {
  const params = useParams();
  const surveyId = params.id as string;

  const [survey, setSurvey] = useState<SurveyWithQuestions | null>(null);
  const [submission, setSubmission] = useState<SurveySubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Record<string, unknown>>>({});
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [showPII, setShowPII] = useState(false);
  const [piiSubmitted, setPiiSubmitted] = useState(false);

  useEffect(() => {
    loadSurvey();
  }, [surveyId]);

  async function loadSurvey() {
    try {
      setLoading(true);
      const data = await getSurveyForTaking(surveyId);
      setSurvey(data);

      // Start submission
      const sub = await startSurveySubmission(surveyId, {
        source: window.self !== window.top ? "embed" : "direct",
      });
      setSubmission(sub);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load survey");
    } finally {
      setLoading(false);
    }
  }

  async function saveAnswer(questionId: string, value: Record<string, unknown>) {
    if (!submission) return;

    // Extract voice_transcript if present
    const { voice_transcript, ...answerValue } = value as { voice_transcript?: string } & Record<string, unknown>;

    setAnswers((prev) => ({ ...prev, [questionId]: value }));

    try {
      await submitSurveyAnswer(surveyId, submission.id, {
        question_id: questionId,
        answer_value: answerValue,
        voice_transcript: voice_transcript,
      });
    } catch (e) {
      console.error("Failed to save answer:", e);
    }
  }

  async function handleNext() {
    if (!survey || !submission) return;

    const currentQuestion = survey.questions[currentIndex];
    const currentAnswer = answers[currentQuestion.id];

    // Validate required
    if (currentQuestion.is_required) {
      if (!currentAnswer || Object.keys(currentAnswer).length === 0) {
        setError("This question is required");
        return;
      }
      if (
        currentQuestion.question_type === "multiple_choice" &&
        (!currentAnswer.values || (currentAnswer.values as string[]).length === 0)
      ) {
        setError("Please select at least one option");
        return;
      }
      if (
        currentQuestion.question_type === "open_text" &&
        (!currentAnswer.text || !(currentAnswer.text as string).trim())
      ) {
        setError("Please enter a response");
        return;
      }
    }

    setError(null);

    if (currentIndex < survey.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Complete survey
      setSaving(true);
      try {
        const result = await completeSurveySubmission(surveyId, submission.id);
        setCompleted(true);
        if (result.collect_pii) {
          setShowPII(true);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to complete survey");
      } finally {
        setSaving(false);
      }
    }
  }

  function handlePrevious() {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setError(null);
    }
  }

  async function handlePIISubmit(data: { name?: string; email?: string; company?: string }) {
    if (!submission) return;

    setSaving(true);
    try {
      await submitSurveyPII(surveyId, submission.id, data);
      setPiiSubmitted(true);
      setShowPII(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit contact info");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Loading survey...</div>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error}</p>
          <p className="text-gray-500">This survey may have closed or is not available.</p>
        </div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-gray-400">Survey not found</div>
      </div>
    );
  }

  // Completion screen
  if (completed && !showPII) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold mb-2">Thank you!</h1>
          <p className="text-gray-400">
            Your responses have been recorded. We appreciate your feedback.
          </p>
        </div>
      </div>
    );
  }

  // PII collection screen
  if (showPII) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-semibold text-center mb-4">Almost done!</h2>
          <PIIForm
            onSubmit={handlePIISubmit}
            onSkip={() => {
              setShowPII(false);
            }}
            submitting={saving}
          />
        </div>
      </div>
    );
  }

  const currentQuestion = survey.questions[currentIndex];
  const currentAnswer = answers[currentQuestion.id] || {};
  const progress = ((currentIndex + 1) / survey.questions.length) * 100;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h1 className="text-lg font-medium text-center">{survey.title}</h1>
        <div className="mt-2 h-1 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className="text-center text-sm text-gray-500 mt-1">
          Question {currentIndex + 1} of {survey.questions.length}
        </p>
      </div>

      {/* Question */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <div className="mb-8">
            {/* Audio player for question */}
            {currentQuestion.audio_path && (
              <QuestionAudioPlayer
                audioPath={currentQuestion.audio_path}
                autoPlay={true}
              />
            )}
            <h2 className="text-xl font-medium mb-2">
              {currentQuestion.question_text}
              {currentQuestion.is_required && <span className="text-red-400 ml-1">*</span>}
            </h2>
            {currentQuestion.description && (
              <p className="text-gray-400">{currentQuestion.description}</p>
            )}
          </div>

          <QuestionInput
            question={currentQuestion}
            value={currentAnswer}
            onChange={(value) => saveAnswer(currentQuestion.id, value)}
            allowVoice={survey.allow_voice_input}
            onVoiceTranscript={(transcript) => {
              // Store the voice transcript alongside the answer
              const newValue = { ...currentAnswer, voice_transcript: transcript };
              saveAnswer(currentQuestion.id, newValue);
            }}
          />

          {error && (
            <p className="mt-4 text-red-400 text-sm">{error}</p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="p-4 border-t border-gray-800">
        <div className="max-w-lg mx-auto flex gap-3">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className="flex-1 px-4 py-3 text-gray-400 hover:text-white transition-colors disabled:opacity-30"
          >
            Previous
          </button>
          <button
            onClick={handleNext}
            disabled={saving}
            className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "..." : currentIndex === survey.questions.length - 1 ? "Complete" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
