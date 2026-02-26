// ---------------------------------------------------------------------------
// Types — mirror the FastAPI SyncBundle input schemas
// ---------------------------------------------------------------------------

export interface SyncTranscriptionInput {
  _id: string;
  transcription_name?: string | null;
  video_source?: string | null;
  transcribe_content?: string;
  transcribe_timestamps?: any[];
  transcribe_language?: string | null;
  transcribe_language_iso?: string | null;
  time_processed?: string | null;
  progress_bar?: { percentDone: string; percentDoneAsNumber: number } | null;
  file_type?: string;
  created_by?: string | null;
  updated_by?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  manual_transcribe_timestamps?: any[];
  manual_transcribe_content?: string;
  is_file_attachment?: boolean;
  process_status?: string;
  is_youtube_cc?: boolean;
  length_duration?: number;
  upload_file_type?: string | null;
  process_time?: number | null;
  description?: string | null;
  tags?: string[];
  sieve_metadata?: any | null;
  chapterization_status?: boolean;
  chapterization?: any[];
  reference_id?: string | null;
  version: number;
  file_size?: number;
  sample_video?: boolean;
}

export interface SyncWordInput {
  _id: string;
  process_id: string;
  word: string;
  timestamp_start: string;
  timestamp_end: string;
  word_segment_idx?: number | null;
  word_idx?: number | null;
  word_type?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  version: number;
  is_deleted: boolean;
  confidence: number;
  speaker?: string | null;
  speaker_id?: string | null;
  color?: string | null;
  speaker_name?: string | null;
}

export interface SyncSentenceInput {
  _id: string;
  process_id: string;
  chapter?: number | null;
  timestamp_start: string;
  timestamp_end: string;
  chunker_used?: string | null;
  is_deleted: boolean;
  version: number;
  idioms_available?: boolean;
  text?: string | null;
  words?: any[] | null;
}

export interface SyncParagraphInput {
  _id: string;
  process_id: string;
  chapter?: number | null;
  timestamp_start?: string | null;
  timestamp_end?: string | null;
  original_paragraph_id?: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  date_updated?: string | null;
  date_created?: string | null;
  version?: number | null;
  is_deleted: boolean;
  words?: any[] | null;
  text?: string;
  chunker_used?: string | null;
}

export interface SyncSegmentInput {
  _id: string;
  process_id: string;
  timestamp_start: string;
  timestamp_end: string;
  speaker?: string | null;
  speaker_id?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  version: number;
  is_deleted: boolean;
  proofread?: boolean;
  words?: any[] | null;
  text?: string | null;
}

export interface SyncBundle {
  process_id: string;
  transcription?: SyncTranscriptionInput | null;
  words: SyncWordInput[];
  sentences: SyncSentenceInput[];
  paragraphs: SyncParagraphInput[];
  segments: SyncSegmentInput[];
}

export interface SyncResult {
  updated: number;
  skipped: number;
}

export interface SyncBundleResponse {
  success: boolean;
  server_response: string;
  message?: string;
  data: Record<string, SyncResult>;
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

export function timestampToSeconds(ts: string): number {
  const parts = ts.split(":");
  return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
}

export function secondsToTimestamp(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

export function generateObjectId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
  return timestamp + random;
}

// ---------------------------------------------------------------------------
// Version-aware best-version selector (same logic as Python Helper)
// ---------------------------------------------------------------------------

export function selectBestVersions<T extends { timestamp_start: string; timestamp_end: string; version: number; is_deleted: boolean }>(
  items: T[]
): T[] {
  const sorted = [...items].sort(
    (a, b) => timestampToSeconds(a.timestamp_start) - timestampToSeconds(b.timestamp_start)
  );

  const filtered: T[] = [];
  for (const item of sorted) {
    if (filtered.length === 0) {
      filtered.push(item);
      continue;
    }
    const last = filtered[filtered.length - 1];
    if (timestampToSeconds(item.timestamp_start) < timestampToSeconds(last.timestamp_end)) {
      if (item.version > last.version) {
        filtered[filtered.length - 1] = item;
      }
    } else {
      filtered.push(item);
    }
  }

  return filtered
    .filter((i) => !i.is_deleted)
    .sort((a, b) => timestampToSeconds(a.timestamp_start) - timestampToSeconds(b.timestamp_start));
}

// ---------------------------------------------------------------------------
// Word-level diff (mirrors Python simple_diff)
// ---------------------------------------------------------------------------

export type DiffOp =
  | { type: "keep"; position: number; word: SyncWordInput }
  | { type: "insert"; position: number; text: string }
  | { type: "delete"; position: number; word: SyncWordInput };

export function diffWords(originalWords: SyncWordInput[], newTexts: string[]): DiffOp[] {
  const origTexts = originalWords.map((w) => w.word);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;

  while (i < origTexts.length || j < newTexts.length) {
    if (i < origTexts.length && j < newTexts.length && origTexts[i] === newTexts[j]) {
      ops.push({ type: "keep", position: i, word: originalWords[i] });
      i++;
      j++;
    } else if (i < origTexts.length && j < newTexts.length) {
      let foundLater = false;
      for (let k = j + 1; k < Math.min(j + 5, newTexts.length); k++) {
        if (origTexts[i] === newTexts[k]) {
          ops.push({ type: "insert", position: i, text: newTexts[j] });
          j++;
          foundLater = true;
          break;
        }
      }
      if (!foundLater) {
        let foundInOrig = false;
        for (let k = i + 1; k < Math.min(i + 5, origTexts.length); k++) {
          if (newTexts[j] === origTexts[k]) {
            ops.push({ type: "delete", position: i, word: originalWords[i] });
            i++;
            foundInOrig = true;
            break;
          }
        }
        if (!foundInOrig) {
          ops.push({ type: "delete", position: i, word: originalWords[i] });
          ops.push({ type: "insert", position: i, text: newTexts[j] });
          i++;
          j++;
        }
      }
    } else if (i < origTexts.length) {
      ops.push({ type: "delete", position: i, word: originalWords[i] });
      i++;
    } else {
      ops.push({ type: "insert", position: i, text: newTexts[j] });
      j++;
    }
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Map words to their containing segment
// ---------------------------------------------------------------------------

export function mapWordsToSegments(
  words: SyncWordInput[],
  segments: SyncSegmentInput[]
): Map<number, SyncSegmentInput> {
  const mapping = new Map<number, SyncSegmentInput>();

  for (let i = 0; i < words.length; i++) {
    const wStart = timestampToSeconds(words[i].timestamp_start);
    const wEnd = timestampToSeconds(words[i].timestamp_end);

    for (const seg of segments) {
      const sStart = timestampToSeconds(seg.timestamp_start);
      const sEnd = timestampToSeconds(seg.timestamp_end);
      if (wStart < sEnd && wEnd > sStart) {
        mapping.set(i, seg);
        break;
      }
    }
  }
  return mapping;
}

// ---------------------------------------------------------------------------
// Redistribute word timing evenly within a time range
// ---------------------------------------------------------------------------

const MIN_WORD_DURATION = 0.05;
const MIN_GAP = 0.01;

export function redistributeTiming(
  activeCount: number,
  rangeStart: number,
  rangeEnd: number
): { wordDuration: number; adjustedEnd: number } {
  let duration = rangeEnd - rangeStart;
  let available = duration - MIN_GAP * (activeCount - 1);
  let wordDuration = Math.max(MIN_WORD_DURATION, available / activeCount);

  let adjustedEnd = rangeEnd;
  if (wordDuration <= MIN_WORD_DURATION) {
    const needed = MIN_WORD_DURATION * activeCount + MIN_GAP * (activeCount - 1);
    adjustedEnd = rangeStart + needed;
    wordDuration = MIN_WORD_DURATION;
  }
  return { wordDuration, adjustedEnd };
}

// ---------------------------------------------------------------------------
// Apply paragraph text edit — the core editing function
// ---------------------------------------------------------------------------

export interface ParagraphEditResult {
  newWords: SyncWordInput[];
  deletedWords: SyncWordInput[];
  updatedSegments: SyncSegmentInput[];
}

export function applyParagraphEdit(
  processId: string,
  newVersion: number,
  paragraphStart: string,
  paragraphEnd: string,
  newText: string,
  existingWords: SyncWordInput[],
  existingSegments: SyncSegmentInput[],
): ParagraphEditResult {
  const pStart = timestampToSeconds(paragraphStart);
  const pEnd = timestampToSeconds(paragraphEnd);

  const wordsInRange = existingWords.filter((w) => {
    return timestampToSeconds(w.timestamp_start) >= pStart
        && timestampToSeconds(w.timestamp_end) <= pEnd;
  });

  const segmentsInRange = existingSegments.filter((s) => {
    return timestampToSeconds(s.timestamp_start) < pEnd
        && timestampToSeconds(s.timestamp_end) > pStart;
  });

  const bestWords = selectBestVersions(wordsInRange);
  const bestSegments = selectBestVersions(segmentsInRange);
  const newWordTexts = newText.split(" ").filter((w) => w.length > 0);

  const ops = diffWords(bestWords, newWordTexts);
  const wordToSegment = mapWordsToSegments(bestWords, bestSegments);

  const newWords: SyncWordInput[] = [];
  const deletedWords: SyncWordInput[] = [];
  const updatedSegments: SyncSegmentInput[] = [];

  // Group ops by target segment
  const segOps = new Map<string, DiffOp[]>();
  for (const seg of bestSegments) segOps.set(seg._id, []);

  for (const op of ops) {
    let targetSeg: SyncSegmentInput | undefined;
    if (op.type === "keep" || op.type === "delete") {
      targetSeg = wordToSegment.get(op.position);
    } else {
      if (op.position === 0) {
        targetSeg = bestSegments[0];
      } else if (op.position >= bestWords.length) {
        targetSeg = bestSegments[bestSegments.length - 1];
      } else {
        targetSeg = wordToSegment.get(op.position - 1) ?? bestSegments[0];
      }
    }
    if (targetSeg) {
      segOps.get(targetSeg._id)?.push(op);
    }
  }

  for (const segment of bestSegments) {
    const opsForSeg = segOps.get(segment._id) ?? [];
    const hasChanges = opsForSeg.some((o) => o.type !== "keep");
    if (!hasChanges) continue;

    const activeOps = opsForSeg.filter((o) => o.type !== "delete");
    const segStart = timestampToSeconds(segment.timestamp_start);
    const segEnd = timestampToSeconds(segment.timestamp_end);
    const { wordDuration, adjustedEnd } = redistributeTiming(
      Math.max(activeOps.length, 1),
      segStart,
      segEnd
    );

    let cursor = segStart;
    for (const op of opsForSeg) {
      if (op.type === "keep") {
        newWords.push({
          ...op.word,
          _id: generateObjectId(),
          version: newVersion,
          timestamp_start: secondsToTimestamp(cursor),
          timestamp_end: secondsToTimestamp(cursor + wordDuration),
        });
        cursor += wordDuration + MIN_GAP;
      } else if (op.type === "insert") {
        newWords.push({
          _id: generateObjectId(),
          process_id: processId,
          word: op.text,
          timestamp_start: secondsToTimestamp(cursor),
          timestamp_end: secondsToTimestamp(cursor + wordDuration),
          version: newVersion,
          is_deleted: false,
          confidence: 1,
          word_type: "annotation",
          speaker: segment.speaker,
          speaker_id: segment.speaker_id,
        });
        cursor += wordDuration + MIN_GAP;
      } else if (op.type === "delete") {
        deletedWords.push({
          ...op.word,
          _id: generateObjectId(),
          version: newVersion,
          is_deleted: true,
          word_type: "annotation",
        });
      }
    }

    if (adjustedEnd > segEnd) {
      updatedSegments.push({
        ...segment,
        _id: generateObjectId(),
        version: newVersion,
        timestamp_end: secondsToTimestamp(adjustedEnd),
      });
    }
  }

  return { newWords, deletedWords, updatedSegments };
}

// ---------------------------------------------------------------------------
// Build a complete SyncBundle from local edits
// ---------------------------------------------------------------------------

export function createSyncBundle(
  processId: string,
  opts: {
    transcription?: SyncTranscriptionInput;
    words?: SyncWordInput[];
    sentences?: SyncSentenceInput[];
    paragraphs?: SyncParagraphInput[];
    segments?: SyncSegmentInput[];
  } = {}
): SyncBundle {
  return {
    process_id: processId,
    transcription: opts.transcription ?? null,
    words: opts.words ?? [],
    sentences: opts.sentences ?? [],
    paragraphs: opts.paragraphs ?? [],
    segments: opts.segments ?? [],
  };
}

// ---------------------------------------------------------------------------
// POST the bundle to the server
// ---------------------------------------------------------------------------

export async function postSyncBundle(
  baseUrl: string,
  bundle: SyncBundle
): Promise<SyncBundleResponse> {
  const res = await fetch(`${baseUrl}/api/v2/sync/batch/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bundle),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Sync failed (${res.status}): ${body}`);
  }
  return res.json();
}
