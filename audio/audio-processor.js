/**
 * SDR Copilot — AudioWorklet Processor
 *
 * Runs in a separate thread. Converts Float32 audio to Int16 PCM
 * at 16kHz mono and posts buffers to the main thread for WebSocket transmission.
 */

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._bufferSize = 4096; // ~256ms at 16kHz
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const float32 = input[0];

    for (let i = 0; i < float32.length; i++) {
      const clamped = Math.max(-1, Math.min(1, float32[i]));
      this._buffer.push(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff);
    }

    if (this._buffer.length >= this._bufferSize) {
      const pcm16 = new Int16Array(this._buffer.splice(0, this._bufferSize));
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true;
  }
}

registerProcessor('pcm-processor', PCMProcessor);
