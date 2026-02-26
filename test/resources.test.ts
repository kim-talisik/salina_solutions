import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { validateResources } from '../src/resources.js';

describe('validateResources', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create a temporary directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'salina-test-'));
  });

  afterEach(() => {
    // Clean up temporary directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('should return exists: true when all resources are present', () => {
    const isWindows = process.platform === 'win32';
    const workerName = isWindows ? 'worker.exe' : 'worker';
    
    // Create the required files/folders
    fs.writeFileSync(path.join(tempDir, workerName), 'test content');
    fs.mkdirSync(path.join(tempDir, '_internal'));
    fs.mkdirSync(path.join(tempDir, 'whisper'));
    fs.mkdirSync(path.join(tempDir, 'face_recognition'));

    const result = validateResources(tempDir);

    expect(result.exists).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('should return exists: false when worker executable is missing', () => {
    // Create all except worker
    fs.mkdirSync(path.join(tempDir, '_internal'));
    fs.mkdirSync(path.join(tempDir, 'whisper'));
    fs.mkdirSync(path.join(tempDir, 'face_recognition'));

    const result = validateResources(tempDir);
    const isWindows = process.platform === 'win32';
    const expectedMissing = isWindows ? 'worker.exe' : 'worker';

    expect(result.exists).toBe(false);
    expect(result.missing).toContain(expectedMissing);
  });

  it('should return exists: false when _internal folder is missing', () => {
    const isWindows = process.platform === 'win32';
    const workerName = isWindows ? 'worker.exe' : 'worker';
    
    fs.writeFileSync(path.join(tempDir, workerName), 'test content');
    fs.mkdirSync(path.join(tempDir, 'whisper'));
    fs.mkdirSync(path.join(tempDir, 'face_recognition'));

    const result = validateResources(tempDir);

    expect(result.exists).toBe(false);
    expect(result.missing).toContain('_internal folder');
  });

  it('should return exists: false when all resources are missing', () => {
    const result = validateResources(tempDir);
    const isWindows = process.platform === 'win32';
    const expectedWorker = isWindows ? 'worker.exe' : 'worker';

    expect(result.exists).toBe(false);
    expect(result.missing).toContain(expectedWorker);
    expect(result.missing).toContain('_internal folder');
    expect(result.missing).toContain('whisper');
    expect(result.missing).toContain('face_recognition');
    expect(result.missing.length).toBe(4);
  });

  it('should use correct worker name on Windows', () => {
    const isWindows = process.platform === 'win32';
    const workerName = isWindows ? 'worker.exe' : 'worker';
    
    fs.writeFileSync(path.join(tempDir, workerName), 'test content');
    fs.mkdirSync(path.join(tempDir, '_internal'));
    fs.mkdirSync(path.join(tempDir, 'whisper'));
    fs.mkdirSync(path.join(tempDir, 'face_recognition'));

    const result = validateResources(tempDir);

    expect(result.exists).toBe(true);
  });
});
