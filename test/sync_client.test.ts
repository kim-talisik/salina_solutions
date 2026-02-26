import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  timestampToSeconds,
  secondsToTimestamp,
  generateObjectId,
  selectBestVersions,
  diffWords,
  mapWordsToSegments,
  redistributeTiming,
  applyParagraphEdit,
  createSyncBundle,
  postSyncBundle,
  type SyncWordInput,
  type SyncSegmentInput,
  type SyncBundle,
} from '../src/sync_client.js';

// ---------------------------------------------------------------------------
// Web app API format (for reference and conversion)
// ---------------------------------------------------------------------------

interface ParagraphUpdate {
  type: string;
  paragraph_id: string;
  paragraph_text: string;
  paragraph_start: string;
  paragraph_end: string;
}

interface ApiWord {
  word_id: string;
  word: string;
  timestamp_start: string;
  timestamp_end: string;
  speaker?: string | null;
  speaker_id?: string | null;
  version: number;
  is_deleted: boolean;
  confidence: number;
}

function apiWordToSyncWord(w: ApiWord, processId: string): SyncWordInput {
  return {
    _id: w.word_id,
    process_id: processId,
    word: w.word,
    timestamp_start: w.timestamp_start,
    timestamp_end: w.timestamp_end,
    version: w.version,
    is_deleted: w.is_deleted,
    confidence: w.confidence,
    speaker: w.speaker,
    speaker_id: w.speaker_id,
  };
}

// ---------------------------------------------------------------------------
// Timestamp helpers
// ---------------------------------------------------------------------------

describe('timestampToSeconds', () => {
  it('parses HH:MM:SS.mmm format', () => {
    expect(timestampToSeconds('00:00:00.000')).toBe(0);
    expect(timestampToSeconds('00:00:01.080')).toBeCloseTo(1.08);
    expect(timestampToSeconds('00:01:14.200')).toBeCloseTo(74.2);
    expect(timestampToSeconds('01:00:00.000')).toBe(3600);
  });
});

describe('secondsToTimestamp', () => {
  it('formats seconds to HH:MM:SS.mmm', () => {
    expect(secondsToTimestamp(0)).toBe('00:00:00.000');
    expect(secondsToTimestamp(1.08)).toBe('00:00:01.080');
    expect(secondsToTimestamp(74.2)).toBe('00:01:14.200');
  });

  it('round-trips with timestampToSeconds', () => {
    const ts = '00:01:14.200';
    expect(secondsToTimestamp(timestampToSeconds(ts))).toBe(ts);
  });
});

describe('generateObjectId', () => {
  it('returns 24-char hex string', () => {
    const id = generateObjectId();
    expect(id).toMatch(/^[0-9a-f]{24}$/);
    expect(id.length).toBe(24);
  });
});

// ---------------------------------------------------------------------------
// selectBestVersions
// ---------------------------------------------------------------------------

describe('selectBestVersions', () => {
  it('selects higher version when overlapping', () => {
    const items = [
      { timestamp_start: '00:00:00.000', timestamp_end: '00:00:01.000', version: 1, is_deleted: false },
      { timestamp_start: '00:00:00.500', timestamp_end: '00:00:01.500', version: 2, is_deleted: false },
    ];
    const result = selectBestVersions(items);
    expect(result).toHaveLength(1);
    expect(result[0].version).toBe(2);
  });

  it('filters out deleted items', () => {
    const items = [
      { timestamp_start: '00:00:00.000', timestamp_end: '00:00:01.000', version: 1, is_deleted: false },
      { timestamp_start: '00:00:01.000', timestamp_end: '00:00:02.000', version: 1, is_deleted: true },
    ];
    const result = selectBestVersions(items);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// diffWords
// ---------------------------------------------------------------------------

describe('diffWords', () => {
  const mkWord = (word: string, i: number): SyncWordInput => ({
    _id: `w${i}`,
    process_id: 'p1',
    word,
    timestamp_start: '00:00:00.000',
    timestamp_end: '00:00:01.000',
    version: 1,
    is_deleted: false,
    confidence: 1,
  });

  it('keeps matching words', () => {
    const orig = [mkWord('A', 0), mkWord('B', 1), mkWord('C', 2)];
    const ops = diffWords(orig, ['A', 'B', 'C']);
    expect(ops.every((o) => o.type === 'keep')).toBe(true);
    expect(ops).toHaveLength(3);
  });

  it('detects insert at end', () => {
    const orig = [mkWord('A', 0), mkWord('B', 1)];
    const ops = diffWords(orig, ['A', 'B', 'C']);
    expect(ops.filter((o) => o.type === 'keep')).toHaveLength(2);
    const insert = ops.find((o) => o.type === 'insert');
    expect(insert).toBeDefined();
    expect(insert?.type).toBe('insert');
    if (insert?.type === 'insert') expect(insert.text).toBe('C');
  });

  it('detects delete', () => {
    const orig = [mkWord('A', 0), mkWord('B', 1), mkWord('C', 2)];
    const ops = diffWords(orig, ['A', 'C']);
    const delOp = ops.find((o) => o.type === 'delete');
    expect(delOp).toBeDefined();
    if (delOp?.type === 'delete') expect(delOp.word.word).toBe('B');
  });
});

// ---------------------------------------------------------------------------
// mapWordsToSegments
// ---------------------------------------------------------------------------

describe('mapWordsToSegments', () => {
  it('maps words to overlapping segments', () => {
    const words: SyncWordInput[] = [
      { _id: '1', process_id: 'p', word: 'A', timestamp_start: '00:00:00.000', timestamp_end: '00:00:00.500', version: 1, is_deleted: false, confidence: 1 },
      { _id: '2', process_id: 'p', word: 'B', timestamp_start: '00:00:00.500', timestamp_end: '00:00:01.000', version: 1, is_deleted: false, confidence: 1 },
    ];
    const segments: SyncSegmentInput[] = [
      { _id: 's1', process_id: 'p', timestamp_start: '00:00:00.000', timestamp_end: '00:00:01.000', version: 1, is_deleted: false },
    ];
    const m = mapWordsToSegments(words, segments);
    expect(m.get(0)?._id).toBe('s1');
    expect(m.get(1)?._id).toBe('s1');
  });
});

// ---------------------------------------------------------------------------
// redistributeTiming
// ---------------------------------------------------------------------------

describe('redistributeTiming', () => {
  it('distributes time evenly across words', () => {
    const { wordDuration, adjustedEnd } = redistributeTiming(3, 0, 1);
    expect(wordDuration).toBeGreaterThan(0);
    expect(adjustedEnd).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// applyParagraphEdit
// ---------------------------------------------------------------------------

describe('applyParagraphEdit', () => {
  const processId = '69786b1146e3748768b2efe1';
  const newVersion = 3;

  it('handles insert at end (simulating web app paragraph edit)', () => {
    // Original: "Alright? Yeah. problem?" -> New: "Alright? Yeah. problem? hello"
    // Use single segment so all ops (3 keeps + 1 insert) are processed together
    const existingWords: SyncWordInput[] = [
      { _id: 'w1', process_id: processId, word: 'Alright?', timestamp_start: '00:00:01.080', timestamp_end: '00:00:01.240', version: 2, is_deleted: false, confidence: 1 },
      { _id: 'w2', process_id: processId, word: 'Yeah.', timestamp_start: '00:00:01.240', timestamp_end: '00:00:01.560', version: 2, is_deleted: false, confidence: 1 },
      { _id: 'w3', process_id: processId, word: 'problem?', timestamp_start: '00:01:13.666', timestamp_end: '00:01:13.838', version: 2, is_deleted: false, confidence: 1 },
    ];
    const existingSegments: SyncSegmentInput[] = [
      { _id: 's1', process_id: processId, timestamp_start: '00:00:01.080', timestamp_end: '00:01:14.200', version: 2, is_deleted: false, speaker: 'B', speaker_id: 'sp1' },
    ];

    const newText = 'Alright? Yeah. problem? hello';
    const result = applyParagraphEdit(
      processId,
      newVersion,
      '00:00:01.080',
      '00:01:14.200',
      newText,
      existingWords,
      existingSegments
    );

    expect(result.newWords.length).toBeGreaterThanOrEqual(4);
    const lastWord = result.newWords[result.newWords.length - 1];
    expect(lastWord.word).toBe('hello');
    expect(lastWord.version).toBe(newVersion);
    expect(lastWord.is_deleted).toBe(false);
    expect(lastWord.timestamp_start).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
    expect(lastWord.timestamp_end).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('handles pure text replacement', () => {
    const existingWords: SyncWordInput[] = [
      { _id: 'w1', process_id: processId, word: 'Hello', timestamp_start: '00:00:00.000', timestamp_end: '00:00:00.300', version: 1, is_deleted: false, confidence: 1 },
      { _id: 'w2', process_id: processId, word: 'world', timestamp_start: '00:00:00.300', timestamp_end: '00:00:00.600', version: 1, is_deleted: false, confidence: 1 },
    ];
    const existingSegments: SyncSegmentInput[] = [
      { _id: 's1', process_id: processId, timestamp_start: '00:00:00.000', timestamp_end: '00:00:01.000', version: 1, is_deleted: false },
    ];

    const result = applyParagraphEdit(
      processId,
      newVersion,
      '00:00:00.000',
      '00:00:01.000',
      'Hello universe',
      existingWords,
      existingSegments
    );

    expect(result.deletedWords.some((w) => w.word === 'world')).toBe(true);
    expect(result.newWords.some((w) => w.word === 'universe')).toBe(true);
  });

  it('extends segment when new words exceed original range', () => {
    // Range 0–0.10s is too short for 3 words (min ~0.17s); redistributeTiming will extend
    const existingWords: SyncWordInput[] = [
      { _id: 'w1', process_id: processId, word: 'A', timestamp_start: '00:00:00.000', timestamp_end: '00:00:00.100', version: 1, is_deleted: false, confidence: 1 },
    ];
    const existingSegments: SyncSegmentInput[] = [
      { _id: 's1', process_id: processId, timestamp_start: '00:00:00.000', timestamp_end: '00:00:00.100', version: 1, is_deleted: false },
    ];

    const result = applyParagraphEdit(
      processId,
      newVersion,
      '00:00:00.000',
      '00:00:00.100',
      'A B C',
      existingWords,
      existingSegments
    );

    expect(result.newWords).toHaveLength(3);
    expect(result.updatedSegments.length).toBeGreaterThan(0);
    const seg = result.updatedSegments[0];
    expect(timestampToSeconds(seg.timestamp_end)).toBeGreaterThan(0.1);
  });
});

// ---------------------------------------------------------------------------
// createSyncBundle
// ---------------------------------------------------------------------------

describe('createSyncBundle', () => {
  it('builds bundle with defaults', () => {
    const bundle = createSyncBundle('p1');
    expect(bundle.process_id).toBe('p1');
    expect(bundle.transcription).toBeNull();
    expect(bundle.words).toEqual([]);
    expect(bundle.sentences).toEqual([]);
    expect(bundle.paragraphs).toEqual([]);
    expect(bundle.segments).toEqual([]);
  });

  it('builds bundle with provided data', () => {
    const words: SyncWordInput[] = [
      { _id: 'w1', process_id: 'p1', word: 'Hi', timestamp_start: '00:00:00.000', timestamp_end: '00:00:00.200', version: 1, is_deleted: false, confidence: 1 },
    ];
    const bundle = createSyncBundle('p1', { words });
    expect(bundle.words).toHaveLength(1);
    expect(bundle.words[0].word).toBe('Hi');
  });
});

// ---------------------------------------------------------------------------
// postSyncBundle (with mocked fetch)
// ---------------------------------------------------------------------------

describe('postSyncBundle', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/v2/sync/batch/ and returns parsed JSON', async () => {
    const mockRes = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        success: true,
        server_response: 'ok',
        data: { words: { updated: 5, skipped: 0 }, segments: { updated: 1, skipped: 0 } },
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockRes));

    const bundle: SyncBundle = createSyncBundle('p1', {
      words: [
        { _id: 'w1', process_id: 'p1', word: 'Hi', timestamp_start: '00:00:00.000', timestamp_end: '00:00:00.200', version: 1, is_deleted: false, confidence: 1 },
      ],
    });

    const result = await postSyncBundle('https://api.example.com', bundle);

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v2/sync/batch/',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bundle),
      })
    );
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: () => Promise.resolve('Bad request'),
    }));

    const bundle = createSyncBundle('p1');
    await expect(postSyncBundle('https://api.example.com', bundle)).rejects.toThrow(/400/);
  });
});

// ---------------------------------------------------------------------------
// Web app API format conversion
// ---------------------------------------------------------------------------

describe('Web app API format conversion', () => {
  it('converts API word response to SyncWordInput', () => {
    const apiWord: ApiWord = {
      word_id: '699fb35b8b4d10ef2649f86b',
      word: 'Alright?',
      timestamp_start: '00:00:01.080',
      timestamp_end: '00:00:01.240',
      speaker: 'B',
      speaker_id: '69786c2fadb29576163a8ed6',
      version: 3,
      is_deleted: false,
      confidence: 1.0,
    };
    const syncWord = apiWordToSyncWord(apiWord, '69786b1146e3748768b2efe1');
    expect(syncWord._id).toBe(apiWord.word_id);
    expect(syncWord.word).toBe(apiWord.word);
    expect(syncWord.timestamp_start).toBe(apiWord.timestamp_start);
    expect(syncWord.timestamp_end).toBe(apiWord.timestamp_end);
    expect(syncWord.speaker).toBe(apiWord.speaker);
    expect(syncWord.speaker_id).toBe(apiWord.speaker_id);
  });
});
