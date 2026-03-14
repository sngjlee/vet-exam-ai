import type { WrongAnswerNote } from "../types";
import { WRONG_NOTES_KEY } from "../storage";
import type { WrongNotesRepository } from "./repository";

export class LocalStorageWrongNotesRepository implements WrongNotesRepository {
  private read(): WrongAnswerNote[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(WRONG_NOTES_KEY);
      return raw ? (JSON.parse(raw) as WrongAnswerNote[]) : [];
    } catch {
      return [];
    }
  }

  private write(notes: WrongAnswerNote[]): void {
    localStorage.setItem(WRONG_NOTES_KEY, JSON.stringify(notes));
  }

  async getAll(): Promise<WrongAnswerNote[]> {
    return this.read();
  }

  async upsert(note: WrongAnswerNote): Promise<void> {
    const notes = this.read();
    const idx = notes.findIndex((n) => n.questionId === note.questionId);
    if (idx >= 0) {
      notes[idx] = note;
    } else {
      notes.push(note);
    }
    this.write(notes);
  }

  async delete(questionId: string): Promise<void> {
    this.write(this.read().filter((n) => n.questionId !== questionId));
  }

  async clearAll(): Promise<void> {
    this.write([]);
  }
}
