// Video capture, the browser's half of Celestia's capture flow.
//
// The other half is the engine's: CelestiaCore holds the MovieCapture object,
// hands it every frame it draws, and reads its size, frame rate and frame count
// back out for the HUD, which frames the recorded area and shows the elapsed
// time. F11 starts and pauses a capture and F12 ends it, all inside
// CelestiaCore::keyDown, exactly as on the desktop.
//
// What the browser adds is the encoding. A desktop capture is an FFMPEGCapture
// writing a file; here MediaRecorder encodes the canvas, and the object the core
// holds is a stub the binding supplies -- WebMovieCapture in native/bindings.cpp
// -- that counts frames and nothing else. So the shell brings the recorder in
// step with the core's state rather than keeping a state of its own.
//
// Of the two dialogs Celestia opens, the first is the browser's own save dialog,
// which only exists where the page has the File System Access API; without it a
// recording is downloaded when it ends. The second carries the Qt dialog's
// choices. The codec list is the one place the web cannot follow: the Qt dialog
// offers FFVHUFF and H.264, neither of which MediaRecorder encodes, so the two
// WebM codecs stand in.

import { showMessage, viewport } from '@/store/app';

/** What the Capture Video dialog hands over. */
export interface CaptureSettings {
  width: number;
  height: number;
  frameRate: number;
  mimeType: string;
  bitRate: number;
}

/** The sizes the Qt dialog offers, in its order. */
export const CAPTURE_SIZES: Array<[number, number]> = [
  [160, 120],
  [320, 240],
  [640, 480],
  [720, 480],
  [720, 576],
  [1024, 768],
  [1280, 720],
  [1920, 1080],
];

/** The frame rates the Qt dialog offers, in its order. */
export const CAPTURE_FRAME_RATES = [15, 23.976, 24, 25, 29.97, 30, 60];

/** The codecs it offers in place of FFVHUFF and H.264. */
export const CAPTURE_CODECS = [
  { label: 'VP9 (WebM)', mimeType: 'video/webm;codecs=vp9' },
  { label: 'VP8 (WebM)', mimeType: 'video/webm;codecs=vp8' },
];

/** Qt's own starting bitrate. */
export const CAPTURE_DEFAULT_BITRATE = 400000;

/** The File System Access API, which lib.dom does not declare. */
interface WindowWithFilePicker extends Window {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
}

// The canvas the engine draws into, registered by the window that owns it.
let source: HTMLCanvasElement | null = null;

// The recording in progress, if there is one. Its state follows the core's.
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];

// The canvas the frames are copied into when the recording is smaller than the
// viewport, and the animation frame that does the copying.
let scaled: HTMLCanvasElement | null = null;
let pump = 0;

// Where the recording is written. The chosen one is what the next capture is
// armed with; the armed one belongs to the capture that is running, because the
// file dialog can be answered again while that one is still going.
let chosenTarget: FileSystemFileHandle | null = null;
let recordingTarget: FileSystemFileHandle | null = null;

export function setCaptureSource(canvas: HTMLCanvasElement | null): void {
  source = canvas;
}

/**
 * Asks where the recording should go, which the Qt front end does first.
 *
 * Returns false when the user closed the dialog, in which case nothing is
 * recorded, matching the empty filename that ends the Qt slot.
 */
export async function chooseCaptureTarget(): Promise<boolean> {
  chosenTarget = null;
  const picker = (window as WindowWithFilePicker).showSaveFilePicker;
  if (picker === undefined) return true;

  try {
    chosenTarget = await picker.call(window, {
      suggestedName: `celestia-${Date.now()}.webm`,
      types: [{ description: 'WebM video', accept: { 'video/webm': ['.webm'] } }],
    });
    return true;
  } catch (error) {
    // Cancelling is the user changing their mind rather than a failure.
    return !(error instanceof DOMException && error.name === 'AbortError');
  }
}

/**
 * Arms a capture at the size and rate asked for, which is what the Qt slot does
 * once its file and settings dialogs are answered.
 *
 * The core is left paused, as the Qt one is: initMovieCapture only stores the
 * object, so the HUD reports Paused and F11 is what starts it. The recorder is
 * started and paused to match, and syncCaptureFromEngine moves it from there.
 *
 * The Qt capture renders at the size it was given; the canvas here is whatever
 * size the window is, so a recording at another size is made by copying each
 * frame into a canvas of that size.
 */
export function startCapture(settings: CaptureSettings): void {
  const canvas = source;
  const engine = viewport()?.engine;
  if (canvas === null || engine === undefined || recorder !== null) return;
  if (typeof MediaRecorder === 'undefined' || typeof canvas.captureStream !== 'function') {
    showMessage('This browser cannot record video', 3);
    return;
  }
  // A capture already armed: the core keeps the first one it is given and says
  // nothing about the rest, so this one is dropped without a word.
  if (!engine.startMovieCapture(settings.width, settings.height, settings.frameRate)) return;
  recordingTarget = chosenTarget;
  chosenTarget = null;

  let frames = canvas;
  if (settings.width !== canvas.width || settings.height !== canvas.height) {
    scaled = document.createElement('canvas');
    scaled.width = settings.width;
    scaled.height = settings.height;
    frames = scaled;
    pumpFrames(canvas, scaled);
  } else {
    scaled = null;
  }

  const options: MediaRecorderOptions = { videoBitsPerSecond: settings.bitRate };
  if (settings.mimeType !== '' && MediaRecorder.isTypeSupported(settings.mimeType)) {
    options.mimeType = settings.mimeType;
  }

  chunks = [];
  recorder = new MediaRecorder(frames.captureStream(settings.frameRate), options);
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  // The stop event is where the recording is assembled; an error is reported
  // and then followed by one, so the file still comes out.
  recorder.onerror = () => showMessage('Video capture failed', 3);
  recorder.onstop = () => finishCapture();
  recorder.start();
  recorder.pause();

  showMessage(`Capturing ${settings.width} x ${settings.height} video`, 3);
}

/**
 * Brings the recorder in step with the core, which F11 and F12 move.
 *
 * The core decides what those keys mean -- it starts, pauses or ends the
 * capture -- so the shell reads that state back instead of repeating the rules.
 */
export function syncCaptureFromEngine(): void {
  const engine = viewport()?.engine;
  if (engine === undefined || recorder === null) return;

  if (!engine.isCaptureActive()) {
    recorder.stop();
    return;
  }

  const recording = engine.isRecording();
  if (recording && recorder.state === 'paused') recorder.resume();
  else if (!recording && recorder.state === 'recording') recorder.pause();
}

function pumpFrames(from: HTMLCanvasElement, to: HTMLCanvasElement): void {
  const context = to.getContext('2d');
  if (context === null) return;
  const step = (): void => {
    context.drawImage(from, 0, 0, to.width, to.height);
    pump = requestAnimationFrame(step);
  };
  pump = requestAnimationFrame(step);
}

function releaseScaledCanvas(): void {
  if (pump !== 0) {
    cancelAnimationFrame(pump);
    pump = 0;
  }
  scaled = null;
}

function finishCapture(): void {
  const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
  const handle = recordingTarget;
  chunks = [];
  recorder = null;
  recordingTarget = null;
  releaseScaledCanvas();
  void saveRecording(blob, handle);
}

async function saveRecording(blob: Blob, handle: FileSystemFileHandle | null): Promise<void> {
  if (blob.size === 0) {
    showMessage('The recording is empty', 3);
    return;
  }

  if (handle !== null) {
    try {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      showMessage(`Video saved to ${handle.name}`, 3);
      return;
    } catch {
      // A refused write leaves the download as the other way out.
    }
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  // MediaRecorder picks its own container where it has no WebM encoder, so the
  // extension follows the type it produced rather than the one asked for.
  link.download = `celestia-${Date.now()}.${blob.type.includes('mp4') ? 'mp4' : 'webm'}`;
  link.click();
  URL.revokeObjectURL(url);
  showMessage('Video saved', 2);
}
