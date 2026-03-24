/**
 * SDR Copilot — Offscreen Document
 *
 * Captures tab audio using the stream ID provided by the service worker.
 * Converts audio to 16kHz mono PCM and sends chunks back via messaging.
 */

let audioContext = null;
let processorNode = null;
let sourceNode = null;
let mediaStream = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'OFFSCREEN_START_CAPTURE') {
    startCapture(message.streamId)
      .then(() => sendResponse({ ok: true }))
      .catch(err => sendResponse({ ok: false, error: err.message }));
    return true;
  }

  if (message.type === 'OFFSCREEN_STOP_CAPTURE') {
    stopCapture();
    sendResponse({ ok: true });
    return false;
  }
});

async function startCapture(streamId) {
  if (mediaStream) stopCapture();

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });

  audioContext = new AudioContext({ sampleRate: 16000 });
  sourceNode = audioContext.createMediaStreamSource(mediaStream);

  // Use ScriptProcessorNode in offscreen (AudioWorklet requires module loading)
  processorNode = audioContext.createScriptProcessor(4096, 1, 1);

  processorNode.onaudioprocess = (ev) => {
    const float32 = ev.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    }
    // Send PCM chunk to content script via service worker relay
    chrome.runtime.sendMessage({
      type: 'OFFSCREEN_AUDIO_CHUNK',
      buffer: Array.from(int16)
    });
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioContext.destination);
}

function stopCapture() {
  if (processorNode) {
    processorNode.disconnect();
    processorNode.onaudioprocess = null;
    processorNode = null;
  }
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach(t => t.stop());
    mediaStream = null;
  }
}
