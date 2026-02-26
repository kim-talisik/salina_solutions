import fs from 'node:fs';
import path from 'node:path';

/** Resource types to validate */
export type ResourceKind = 'whisper' | 'worker' | 'face_recognition' | '_internal';

export interface ResourcePaths {
    workerExe: string;
    internalFolder: string;
    whisper: string;
    faceRecognition: string;
}

const RESOURCE_CHECKS: { key: keyof ResourcePaths; path: (base: string) => string; label: string }[] = [
    { key: 'workerExe', path: (b) => path.join(b, process.platform === 'win32' ? 'worker.exe' : 'worker'), label: process.platform === 'win32' ? 'worker.exe' : 'worker' },
    { key: 'internalFolder', path: (b) => path.join(b, '_internal'), label: '_internal folder' },
    { key: 'whisper', path: (b) => path.join(b, 'whisper'), label: 'whisper' },
    { key: 'faceRecognition', path: (b) => path.join(b, 'face_recognition'), label: 'face_recognition' }
];

export function validateResources(basePath: string): { exists: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const { path: getPath, label } of RESOURCE_CHECKS) {
        if (!fs.existsSync(getPath(basePath))) missing.push(label);
    }
    return {
        exists: missing.length === 0,
        missing
    };
}
