"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getSurvey,
  updateSurvey,
  publishSurvey,
  closeSurvey,
  createSurveyQuestion,
  updateSurveyQuestion,
  deleteSurveyQuestion,
  reorderSurveyQuestions,
  getSurveyResults,
  synthesizeSurvey,
  listPresenters,
  API_URL,
} from "@/lib/api";
import type { SurveyWithQuestions, SurveyQuestion, SurveyResults, QuestionOption, Presenter } from "@/lib/types";

const QUESTION_TYPES = [
  { value: "single_choice", label: "Single Choice", description: "One answer from options" },
  { value: "multiple_choice", label: "Multiple Choice", description: "Multiple answers from options" },
  { value: "rating", label: "Rating", description: "Star rating (1-5)" },
  { value: "scale", label: "Scale", description: "Number scale with labels" },
  { value: "open_text", label: "Open Text", description: "Free text response" },
  { value: "true_false", label: "True/False", description: "Binary choice" },
];

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    draft: "bg-gray-500/20 text-gray-400",
    published: "bg-green-500/20 text-green-400",
    closed: "bg-red-500/20 text-red-400",
  };

  return (
    <span className={`px-2 py-1 text-xs rounded ${colors[status] || colors.draft}`}>
      {status}
    </span>
  );
}

type QuestionFormData = {
  question_text: string;
  description?: string;
  question_type: string;
  options?: QuestionOption[];
  min_value?: number;
  max_value?: number;
  min_label?: string;
  max_label?: string;
  is_required?: boolean;
};

function QuestionEditor({
  question,
  onSave,
  onCancel,
  saving,
}: {
  question?: SurveyQuestion;
  onSave: (data: QuestionFormData) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [questionText, setQuestionText] = useState(question?.question_text || "");
  const [description, setDescription] = useState(question?.description || "");
  const [questionType, setQuestionType] = useState<string>(question?.question_type || "single_choice");
  const [options, setOptions] = useState<QuestionOption[]>(
    question?.options || [{ value: "a", label: "" }, { value: "b", label: "" }]
  );
  const [minValue, setMinValue] = useState(question?.min_value ?? 1);
  const [maxValue, setMaxValue] = useState(question?.max_value ?? 5);
  const [minLabel, setMinLabel] = useState(question?.min_label || "");
  const [maxLabel, setMaxLabel] = useState(question?.max_label || "");
  const [isRequired, setIsRequired] = useState(question?.is_required ?? false);

  const needsOptions = ["single_choice", "multiple_choice"].includes(questionType);
  const needsScale = ["rating", "scale"].includes(questionType);

  function addOption() {
    const nextValue = String.fromCharCode(97 + options.length); // a, b, c, ...
    setOptions([...options, { value: nextValue, label: "" }]);
  }

  function removeOption(index: number) {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  }

  function updateOption(index: number, label: string) {
    const newOptions = [...options];
    newOptions[index] = { ...newOptions[index], label };
    setOptions(newOptions);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave({
      question_text: questionText,
      description: description || undefined,
      question_type: questionType,
      options: needsOptions ? options.filter((o) => o.label.trim()) : undefined,
      min_value: needsScale ? minValue : undefined,
      max_value: needsScale ? maxValue : undefined,
      min_label: needsScale ? minLabel || undefined : undefined,
      max_label: needsScale ? maxLabel || undefined : undefined,
      is_required: isRequired,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="bg-gray-700 rounded-lg p-4 space-y-4">
      <div>
        <label className="block text-sm text-gray-400 mb-1">Question Text</label>
        <input
          type="text"
          value={questionText}
          onChange={(e) => setQuestionText(e.target.value)}
          className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="What is your question?"
          required
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Description (optional)</label>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
          placeholder="Additional context for the question"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-1">Question Type</label>
        <select
          value={questionType}
          onChange={(e) => setQuestionType(e.target.value)}
          className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label} - {type.description}
            </option>
          ))}
        </select>
      </div>

      {needsOptions && (
        <div>
          <label className="block text-sm text-gray-400 mb-2">Options</label>
          <div className="space-y-2">
            {options.map((option, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-gray-500 w-6">{option.value}.</span>
                <input
                  type="text"
                  value={option.label}
                  onChange={(e) => updateOption(index, e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
                  placeholder={`Option ${option.value.toUpperCase()}`}
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    className="text-red-400 hover:text-red-300 p-1"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addOption}
            className="mt-2 text-sm text-blue-400 hover:text-blue-300"
          >
            + Add Option
          </button>
        </div>
      )}

      {needsScale && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Min Value</label>
            <input
              type="number"
              value={minValue}
              onChange={(e) => setMinValue(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Value</label>
            <input
              type="number"
              value={maxValue}
              onChange={(e) => setMaxValue(parseInt(e.target.value))}
              className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Min Label</label>
            <input
              type="text"
              value={minLabel}
              onChange={(e) => setMinLabel(e.target.value)}
              className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
              placeholder="e.g., Not satisfied"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Max Label</label>
            <input
              type="text"
              value={maxLabel}
              onChange={(e) => setMaxLabel(e.target.value)}
              className="w-full px-3 py-2 bg-gray-600 rounded border border-gray-500 focus:border-blue-500 focus:outline-none"
              placeholder="e.g., Very satisfied"
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="required"
          checked={isRequired}
          onChange={(e) => setIsRequired(e.target.checked)}
          className="rounded bg-gray-600 border-gray-500"
        />
        <label htmlFor="required" className="text-sm text-gray-400">
          Required question
        </label>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !questionText.trim()}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
        >
          {saving ? "Saving..." : question ? "Update" : "Add Question"}
        </button>
      </div>
    </form>
  );
}

function QuestionCard({
  question,
  index,
  onEdit,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  disabled,
}: {
  question: SurveyQuestion;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
  disabled: boolean;
}) {
  const typeInfo = QUESTION_TYPES.find((t) => t.value === question.question_type);

  return (
    <div className="bg-gray-800 rounded-lg p-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <span className="text-gray-500 font-mono">{index + 1}.</span>
          <div>
            <p className="font-medium">
              {question.question_text}
              {question.is_required && <span className="text-red-400 ml-1">*</span>}
            </p>
            {question.description && (
              <p className="text-sm text-gray-400 mt-1">{question.description}</p>
            )}
            <p className="text-xs text-gray-500 mt-2">{typeInfo?.label}</p>
            {question.options && question.options.length > 0 && (
              <div className="mt-2 text-sm text-gray-400">
                {question.options.map((opt, i) => (
                  <span key={i} className="mr-3">
                    {opt.value}. {opt.label}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {!disabled && (
            <>
              <button
                onClick={onMoveUp}
                disabled={isFirst}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                </svg>
              </button>
              <button
                onClick={onMoveDown}
                disabled={isLast}
                className="p-1 text-gray-400 hover:text-white disabled:opacity-30"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              <button
                onClick={onEdit}
                className="p-1 text-gray-400 hover:text-white"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={onDelete}
                className="p-1 text-red-400 hover:text-red-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultsView({ results }: { results: SurveyResults }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Total Responses</p>
          <p className="text-2xl font-bold">{results.total_submissions}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Completed</p>
          <p className="text-2xl font-bold">{results.completed_submissions}</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Completion Rate</p>
          <p className="text-2xl font-bold">{results.completion_rate}%</p>
        </div>
      </div>

      {results.questions.map((q) => (
        <div key={q.question_id} className="bg-gray-800 rounded-lg p-4">
          <h4 className="font-medium mb-2">{q.question_text}</h4>
          <p className="text-sm text-gray-400 mb-4">{q.total_responses} responses</p>

          {q.option_counts && (
            <div className="space-y-2">
              {Object.entries(q.option_counts).map(([option, count]) => {
                const percentage = q.total_responses > 0 ? (count / q.total_responses) * 100 : 0;
                return (
                  <div key={option}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{option}</span>
                      <span>{count} ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-gray-700 rounded">
                      <div
                        className="h-full bg-blue-500 rounded"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {q.average !== undefined && (
            <div>
              <p className="text-lg">
                Average: <span className="font-bold">{q.average.toFixed(1)}</span>
              </p>
              {q.distribution && (
                <div className="flex items-end gap-1 h-16 mt-2">
                  {Object.entries(q.distribution).map(([value, count]) => {
                    const maxCount = Math.max(...Object.values(q.distribution || {}));
                    const height = maxCount > 0 ? (count / maxCount) * 100 : 0;
                    return (
                      <div key={value} className="flex-1 flex flex-col items-center">
                        <div
                          className="w-full bg-blue-500 rounded-t"
                          style={{ height: `${height}%` }}
                        />
                        <span className="text-xs text-gray-500 mt-1">{value}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {q.recent_responses && q.recent_responses.length > 0 && (
            <div className="space-y-2">
              {q.recent_responses.slice(0, 5).map((response, i) => (
                <p key={i} className="text-sm text-gray-300 bg-gray-700 rounded p-2">
                  &quot;{response}&quot;
                </p>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SurveyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const surveyId = params.id as string;

  const [survey, setSurvey] = useState<SurveyWithQuestions | null>(null);
  const [results, setResults] = useState<SurveyResults | null>(null);
  const [presenters, setPresenters] = useState<Presenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"questions" | "settings" | "results">("questions");
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<SurveyQuestion | null>(null);
  const [saving, setSaving] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);

  useEffect(() => {
    loadSurvey();
    loadPresenters();
  }, [surveyId]);

  useEffect(() => {
    if (activeTab === "results" && survey && survey.submission_count > 0) {
      loadResults();
    }
  }, [activeTab, survey?.id]);

  async function loadSurvey() {
    try {
      setLoading(true);
      const data = await getSurvey(surveyId);
      setSurvey(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load survey");
    } finally {
      setLoading(false);
    }
  }

  async function loadResults() {
    try {
      const data = await getSurveyResults(surveyId);
      setResults(data);
    } catch (e) {
      console.error("Failed to load results:", e);
    }
  }

  async function loadPresenters() {
    try {
      const data = await listPresenters();
      setPresenters(data);
    } catch (e) {
      console.error("Failed to load presenters:", e);
    }
  }

  async function handleSynthesize() {
    try {
      setSynthesizing(true);
      const result = await synthesizeSurvey(surveyId);
      setSurvey((prev) =>
        prev ? { ...prev, synthesis_status: result.synthesis_status as "synthesized" } : null
      );
      // Reload to get updated audio paths
      await loadSurvey();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to synthesize audio");
    } finally {
      setSynthesizing(false);
    }
  }

  async function handleAddQuestion(data: QuestionFormData) {
    try {
      setSaving(true);
      const newQuestion = await createSurveyQuestion(surveyId, {
        ...data,
        order_index: survey?.questions.length || 0,
      });
      setSurvey((prev) =>
        prev ? { ...prev, questions: [...prev.questions, newQuestion] } : null
      );
      setShowAddQuestion(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add question");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateQuestion(data: QuestionFormData) {
    if (!editingQuestion) return;
    try {
      setSaving(true);
      const updated = await updateSurveyQuestion(surveyId, editingQuestion.id, data);
      setSurvey((prev) =>
        prev
          ? {
              ...prev,
              questions: prev.questions.map((q) =>
                q.id === updated.id ? updated : q
              ),
            }
          : null
      );
      setEditingQuestion(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update question");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteQuestion(questionId: string) {
    if (!confirm("Are you sure you want to delete this question?")) return;
    try {
      await deleteSurveyQuestion(surveyId, questionId);
      setSurvey((prev) =>
        prev
          ? { ...prev, questions: prev.questions.filter((q) => q.id !== questionId) }
          : null
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete question");
    }
  }

  async function handleReorder(fromIndex: number, toIndex: number) {
    if (!survey) return;
    const newQuestions = [...survey.questions];
    const [moved] = newQuestions.splice(fromIndex, 1);
    newQuestions.splice(toIndex, 0, moved);

    setSurvey({ ...survey, questions: newQuestions });

    try {
      await reorderSurveyQuestions(
        surveyId,
        newQuestions.map((q) => q.id)
      );
    } catch (e) {
      // Reload on error
      loadSurvey();
    }
  }

  async function handlePublish() {
    try {
      const updated = await publishSurvey(surveyId);
      setSurvey((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to publish survey");
    }
  }

  async function handleClose() {
    try {
      const updated = await closeSurvey(surveyId);
      setSurvey((prev) => (prev ? { ...prev, ...updated } : null));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to close survey");
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading survey...</div>
      </div>
    );
  }

  if (!survey) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400">{error || "Survey not found"}</p>
        <Link href="/admin/surveys" className="text-blue-400 hover:underline mt-4 block">
          Back to Surveys
        </Link>
      </div>
    );
  }

  const isEditable = survey.status === "draft";

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Link href="/admin/surveys" className="text-gray-400 hover:text-white">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <h1 className="text-2xl font-bold">{survey.title}</h1>
            <StatusBadge status={survey.status} />
          </div>
          {survey.description && (
            <p className="text-gray-400">{survey.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {survey.status === "draft" && survey.questions.length > 0 && (
            <button
              onClick={handlePublish}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded transition-colors"
            >
              Publish
            </button>
          )}
          {survey.status === "published" && (
            <>
              <Link
                href={`/survey/${survey.id}/take`}
                target="_blank"
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
              >
                Preview
              </Link>
              <button
                onClick={handleClose}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded transition-colors"
              >
                Close Survey
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-900/50 border border-red-700 rounded-lg text-red-200">
          {error}
          <button onClick={() => setError(null)} className="ml-2 text-red-400">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-4 border-b border-gray-700 mb-6">
        <button
          onClick={() => setActiveTab("questions")}
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === "questions"
              ? "border-blue-500 text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Questions ({survey.questions.length})
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === "settings"
              ? "border-blue-500 text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Settings
        </button>
        <button
          onClick={() => setActiveTab("results")}
          className={`pb-2 px-1 border-b-2 transition-colors ${
            activeTab === "results"
              ? "border-blue-500 text-white"
              : "border-transparent text-gray-400 hover:text-white"
          }`}
        >
          Results ({survey.submission_count})
        </button>
      </div>

      {/* Questions Tab */}
      {activeTab === "questions" && (
        <div className="space-y-4">
          {survey.questions.length === 0 && !showAddQuestion ? (
            <div className="text-center py-12 text-gray-400">
              <p className="mb-4">No questions yet</p>
              <button
                onClick={() => setShowAddQuestion(true)}
                className="text-blue-400 hover:text-blue-300"
              >
                Add your first question
              </button>
            </div>
          ) : (
            <>
              {survey.questions.map((question, index) =>
                editingQuestion?.id === question.id ? (
                  <QuestionEditor
                    key={question.id}
                    question={question}
                    onSave={handleUpdateQuestion}
                    onCancel={() => setEditingQuestion(null)}
                    saving={saving}
                  />
                ) : (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    index={index}
                    onEdit={() => setEditingQuestion(question)}
                    onDelete={() => handleDeleteQuestion(question.id)}
                    onMoveUp={() => handleReorder(index, index - 1)}
                    onMoveDown={() => handleReorder(index, index + 1)}
                    isFirst={index === 0}
                    isLast={index === survey.questions.length - 1}
                    disabled={!isEditable}
                  />
                )
              )}

              {showAddQuestion ? (
                <QuestionEditor
                  onSave={handleAddQuestion}
                  onCancel={() => setShowAddQuestion(false)}
                  saving={saving}
                />
              ) : (
                isEditable && (
                  <button
                    onClick={() => setShowAddQuestion(true)}
                    className="w-full py-3 border-2 border-dashed border-gray-600 rounded-lg text-gray-400 hover:border-gray-500 hover:text-gray-300 transition-colors"
                  >
                    + Add Question
                  </button>
                )
              )}
            </>
          )}
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === "settings" && (
        <div className="bg-gray-800 rounded-lg p-6 space-y-6">
          {/* Presenter Selection */}
          <div>
            <h3 className="font-medium mb-4">Presenter</h3>
            <p className="text-sm text-gray-400 mb-3">
              Select a presenter to read the survey questions aloud
            </p>
            <select
              value={survey.presenter_id || ""}
              onChange={async (e) => {
                const updated = await updateSurvey(surveyId, {
                  presenter_id: e.target.value || undefined,
                });
                setSurvey((prev) => (prev ? { ...prev, ...updated } : null));
              }}
              disabled={!isEditable}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="">No presenter (text only)</option>
              {presenters.map((presenter) => (
                <option key={presenter.id} value={presenter.id}>
                  {presenter.name}
                </option>
              ))}
            </select>

            {survey.presenter_id && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm text-gray-400">Audio Synthesis</p>
                    <p className="text-xs text-gray-500">
                      {survey.synthesis_status === "synthesized"
                        ? "Audio generated for all questions"
                        : survey.synthesis_status === "synthesizing"
                        ? "Generating audio..."
                        : survey.synthesis_status === "error"
                        ? "Error generating audio"
                        : "Audio not yet generated"}
                    </p>
                  </div>
                  <button
                    onClick={handleSynthesize}
                    disabled={synthesizing || survey.questions.length === 0}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors disabled:opacity-50"
                  >
                    {synthesizing
                      ? "Synthesizing..."
                      : survey.synthesis_status === "synthesized"
                      ? "Re-synthesize"
                      : "Synthesize Audio"}
                  </button>
                </div>
                {survey.synthesis_status === "synthesized" && (
                  <div className="text-sm text-green-400">
                    {survey.questions.filter((q) => q.audio_path).length} of{" "}
                    {survey.questions.length} questions have audio
                  </div>
                )}
              </div>
            )}
          </div>

          <hr className="border-gray-700" />

          <div>
            <h3 className="font-medium mb-4">Survey Settings</h3>
            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={survey.is_anonymous}
                  onChange={async (e) => {
                    const updated = await updateSurvey(surveyId, {
                      is_anonymous: e.target.checked,
                    });
                    setSurvey((prev) => (prev ? { ...prev, ...updated } : null));
                  }}
                  disabled={!isEditable}
                  className="rounded bg-gray-600 border-gray-500"
                />
                <div>
                  <p className="font-medium">Anonymous Responses</p>
                  <p className="text-sm text-gray-400">
                    Don&apos;t link responses to user accounts
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={survey.collect_pii_at_end}
                  onChange={async (e) => {
                    const updated = await updateSurvey(surveyId, {
                      collect_pii_at_end: e.target.checked,
                    });
                    setSurvey((prev) => (prev ? { ...prev, ...updated } : null));
                  }}
                  disabled={!isEditable}
                  className="rounded bg-gray-600 border-gray-500"
                />
                <div>
                  <p className="font-medium">Collect Contact Info</p>
                  <p className="text-sm text-gray-400">
                    Ask for name/email at the end (optional for respondent)
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={survey.allow_voice_input}
                  onChange={async (e) => {
                    const updated = await updateSurvey(surveyId, {
                      allow_voice_input: e.target.checked,
                    });
                    setSurvey((prev) => (prev ? { ...prev, ...updated } : null));
                  }}
                  disabled={!isEditable}
                  className="rounded bg-gray-600 border-gray-500"
                />
                <div>
                  <p className="font-medium">Voice Input</p>
                  <p className="text-sm text-gray-400">
                    Allow respondents to answer using voice
                  </p>
                </div>
              </label>
            </div>
          </div>

          {survey.status === "published" && (
            <div>
              <h3 className="font-medium mb-4">Share Link</h3>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={`${typeof window !== "undefined" ? window.location.origin : ""}/survey/${survey.id}/take`}
                  className="flex-1 px-3 py-2 bg-gray-700 rounded border border-gray-600 text-gray-300"
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/survey/${survey.id}/take`
                    );
                  }}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}

          {survey.submission_count > 0 && (
            <div>
              <h3 className="font-medium mb-4">Export</h3>
              <a
                href={`${API_URL}/api/v1/surveys/${survey.id}/export`}
                target="_blank"
                className="inline-block px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded transition-colors"
              >
                Download CSV
              </a>
            </div>
          )}
        </div>
      )}

      {/* Results Tab */}
      {activeTab === "results" && (
        <div>
          {survey.submission_count === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <p>No responses yet</p>
              {survey.status === "published" && (
                <p className="text-sm mt-2">
                  Share the survey link to start collecting responses
                </p>
              )}
            </div>
          ) : results ? (
            <ResultsView results={results} />
          ) : (
            <div className="text-center py-12 text-gray-400">
              Loading results...
            </div>
          )}
        </div>
      )}
    </div>
  );
}
