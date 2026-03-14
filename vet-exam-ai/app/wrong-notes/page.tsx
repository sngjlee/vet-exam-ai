"use client";

import { useRouter } from "next/navigation";
import { RETRY_SESSION_KEY } from "../../lib/storage";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { WrongAnswerNote } from "../../lib/types";

const WRONG_NOTES_KEY = "vet-wrong-notes";

export default function WrongNotesPage() {
  const [wrongNotes, setWrongNotes] = useState<WrongAnswerNote[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(WRONG_NOTES_KEY);

    if (saved) {
      try {
        const parsed: WrongAnswerNote[] = JSON.parse(saved);
        setWrongNotes(parsed);
      } catch (error) {
        console.error("Failed to parse wrong notes:", error);
      }
    }

    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(WRONG_NOTES_KEY, JSON.stringify(wrongNotes));
  }, [wrongNotes, loaded]);

  const categories = useMemo(() => {
    return [...new Set(wrongNotes.map((note) => note.category))];
  }, [wrongNotes]);

  const filteredNotes =
    selectedCategory === "All"
      ? wrongNotes
      : wrongNotes.filter((note) => note.category === selectedCategory);

  function handleDelete(questionId: string) {
    setWrongNotes((prev) => prev.filter((note) => note.questionId !== questionId));
  }

  function handleClearAll() {
    setWrongNotes([]);
  }

  const router = useRouter();

function handleRetryWrongAnswers() {
  const retryQuestions = filteredNotes.map((note) => ({
    id: note.questionId,
    question: note.question,
    choices: note.choices,
    answer: note.correctAnswer,
    explanation: note.explanation,
    category: note.category,
  }));

  localStorage.setItem(RETRY_SESSION_KEY, JSON.stringify(retryQuestions));
  router.push("/retry-wrong");
}

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Wrong Answer Notes</h1>
          <p className="mt-2 text-neutral-400">
            Review incorrect answers and explanations
          </p>
        </div>

        <Link
          href="/"
          className="rounded-lg border border-neutral-600 px-4 py-2 hover:border-neutral-400"
        >
          Back Home
        </Link>
      </div>

      <section className="mb-6 rounded-xl border border-neutral-700 p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <label className="mb-2 block text-sm font-medium">Filter by subject</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-neutral-600 bg-transparent px-3 py-2"
            >
              <option value="All">All</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleRetryWrongAnswers}
            disabled={filteredNotes.length === 0}
            className="rounded-lg bg-white px-4 py-2 text-black disabled:opacity-50"
          >
            Retry Wrong Answers
          </button>
          <button
            onClick={handleClearAll}
            className="rounded-lg border border-red-500 px-4 py-2 text-red-400 hover:bg-red-500/10"
          >
            Clear All
          </button>
        </div>
      </section>

      {filteredNotes.length === 0 ? (
        <section className="rounded-xl border border-neutral-700 p-6">
          <p>No saved wrong answers.</p>
        </section>
      ) : (
        <section className="space-y-4">
          {filteredNotes.map((note) => (
            <article
              key={note.questionId}
              className="rounded-xl border border-neutral-700 p-5"
            >
              <p className="mb-1 text-sm text-neutral-400">{note.category}</p>
              <h2 className="mb-3 text-lg font-semibold">{note.question}</h2>
              <p>My answer: {note.selectedAnswer}</p>
              <p>Correct answer: {note.correctAnswer}</p>
              <p className="mt-2 text-neutral-300">
                Explanation: {note.explanation}
              </p>

              <button
                onClick={() => handleDelete(note.questionId)}
                className="mt-4 rounded-lg border border-neutral-600 px-3 py-2 text-sm hover:border-neutral-400"
              >
                Delete
              </button>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}