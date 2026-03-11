/**
 * SDR Copilot — Deepgram WebSocket Client
 *
 * Handles real-time audio streaming to Deepgram's Nova-2 model.
 *
 * KEY FIXES for the "WebSocket closes immediately" issue:
 *  1. Pass API key as query param (browser WebSocket cannot set custom headers)
 *  2. Send a silent audio chunk within 500ms of connection open
 *  3. Send KeepAlive JSON every 8 seconds
 *  4. Exponential backoff on reconnect (max 5 attempts)
 */

(function () {
  'use strict';

  // ─── DeepgramClient Class ───────────────────────────────────────────────────

  class DeepgramClient {
    constructor() {
      this._ws = null;
      this._apiKey = null;
      this._audioStream = null;
      this._audioContext = null;
      this._processorNode = null;
      this._sourceNode = null;
      this._keepaliveTimer = null;
      this._reconnectTimer = null;
      this._reconnectAttempts = 0;
      this._maxReconnectAttempts = 5;
      this._stopping = false;
      this._silenceSent = false;

      // Callbacks
      this.onTranscript = null;
      this.onError = null;
      this.onClose = null;
      this.onOpen = null;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Start transcription.
     * @param {string} apiKey   Deepgram API key
     * @param {MediaStream} audioStream  Captured tab audio stream
     */
    start(apiKey, audioStream) {
      this._apiKey = apiKey;
      this._audioStream = audioStream;
      this._stopping = false;
      this._reconnectAttempts = 0;
      this._connect();
    }

    /** Stop transcription and release all resources. */
    stop() {
      this._stopping = true;
      this._cleanup();
    }

    // ── Connection ────────────────────────────────────────────────────────────

    _buildUrl() {
      const params = new URLSearchParams({
        encoding: 'linear16',
        sample_rate: '16000',
        channels: '1',
        model: 'nova-2',
        smart_format: 'true',
        interim_results: 'true',
        endpointing: '300',
        utterance_end_ms: '1000',
        vad_events: 'true'
      });
      // Pass API key as query param — the only reliable method in browser context
      return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
    }

    _connect() {
      try {
        const url = this._buildUrl();

        // Pass token via subprotocol array: ['token', <api_key>]
        // Deepgram accepts this as an alternative to the Authorization header
        this._ws = new WebSocket(url, ['token', this._apiKey]);
        this._ws.binaryType = 'arraybuffer';

        this._ws.onopen = () => this._onOpen();
        this._ws.onmessage = (ev) => this._onMessage(ev);
        this._ws.onerror = (ev) => this._onWsError(ev);
        this._ws.onclose = (ev) => this._onClose(ev);
      } catch (err) {
        this._emitError(`WebSocket construction failed: ${err.message}`);
        this._scheduleReconnect();
      }
    }

    _onOpen() {
      this._reconnectAttempts = 0;
      this._silenceSent = false;

      // FIX #1: Send silent audio IMMEDIATELY to prevent Deepgram timeout
      // 100 ms of silence at 16kHz mono = 1600 samples × 2 bytes = 3200 bytes
      this._sendSilence();

      // FIX #2: Start keepalive pings every 8 seconds
      this._startKeepalive();

      // FIX #3: Wire up real audio pipeline within 500ms
      this._setupAudioPipeline();

      if (typeof this.onOpen === 'function') this.onOpen();
    }

    _sendSilence() {
      if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
      const silence = new Int16Array(1600); // 100ms @16kHz
      this._ws.send(silence.buffer);
      this._silenceSent = true;
    }

    _startKeepalive() {
      this._stopKeepalive();
      this._keepaliveTimer = setInterval(() => {
        if (this._ws && this._ws.readyState === WebSocket.OPEN) {
          this._ws.send(JSON.stringify({ type: 'KeepAlive' }));
        }
      }, 8000);
    }

    _stopKeepalive() {
      if (this._keepaliveTimer) {
        clearInterval(this._keepaliveTimer);
        this._keepaliveTimer = null;
      }
    }

    // ── Audio Pipeline ────────────────────────────────────────────────────────

    _setupAudioPipeline() {
      try {
        if (!this._audioStream) {
          console.warn('[DeepgramClient] No audio stream available');
          return;
        }

        this._audioContext = new AudioContext({ sampleRate: 16000 });
        this._sourceNode = this._audioContext.createMediaStreamSource(this._audioStream);

        // ScriptProcessorNode gives us raw PCM buffers
        // bufferSize 4096 → ~256ms at 16kHz (low latency while still chunky enough)
        this._processorNode = this._audioContext.createScriptProcessor(4096, 1, 1);

        this._processorNode.onaudioprocess = (ev) => {
          if (!this._ws || this._ws.readyState !== WebSocket.OPEN) return;
          const float32 = ev.inputBuffer.getChannelData(0);
          const pcm16 = this._float32ToInt16(float32);
          this._ws.send(pcm16.buffer);
        };

        this._sourceNode.connect(this._processorNode);
        this._processorNode.connect(this._audioContext.destination);
      } catch (err) {
        this._emitError(`Audio pipeline error: ${err.message}`);
      }
    }

    _float32ToInt16(float32Array) {
      const int16 = new Int16Array(float32Array.length);
      for (let i = 0; i < float32Array.length; i++) {
        const clamped = Math.max(-1, Math.min(1, float32Array[i]));
        int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      }
      return int16;
    }

    // ── Message Handling ──────────────────────────────────────────────────────

    _onMessage(ev) {
      try {
        const data = JSON.parse(ev.data);

        if (data.type === 'Results') {
          const alt = data.channel?.alternatives?.[0];
          if (!alt) return;

          const transcript = alt.transcript || '';
          const isFinal = data.is_final === true;
          const confidence = alt.confidence || 0;

          if (transcript.trim() && typeof this.onTranscript === 'function') {
            this.onTranscript({ transcript, isFinal, confidence });
          }
        } else if (data.type === 'UtteranceEnd') {
          if (typeof this.onTranscript === 'function') {
            this.onTranscript({ transcript: '', isFinal: true, utteranceEnd: true });
          }
        } else if (data.type === 'SpeechStarted') {
          // Speech activity detected — useful for talk-time tracking
          if (typeof this.onTranscript === 'function') {
            this.onTranscript({ speechStarted: true });
          }
        } else if (data.type === 'Metadata') {
          console.debug('[DeepgramClient] Metadata:', data);
        } else if (data.type === 'Error') {
          this._emitError(`Deepgram error: ${data.message || JSON.stringify(data)}`);
        }
      } catch (err) {
        console.warn('[DeepgramClient] Failed to parse message:', err);
      }
    }

    _onWsError(ev) {
      this._emitError('WebSocket error occurred');
    }

    _onClose(ev) {
      this._stopKeepalive();
      this._teardownAudioPipeline();

      const reason = ev.reason ? ` (${ev.reason})` : '';
      console.info(`[DeepgramClient] WebSocket closed — code ${ev.code}${reason}`);

      if (typeof this.onClose === 'function') {
        this.onClose({ code: ev.code, reason: ev.reason });
      }

      if (!this._stopping && ev.code !== 1000) {
        this._scheduleReconnect();
      }
    }

    // ── Reconnect Logic ───────────────────────────────────────────────────────

    _scheduleReconnect() {
      if (this._stopping) return;
      if (this._reconnectAttempts >= this._maxReconnectAttempts) {
        this._emitError('Max reconnection attempts reached');
        return;
      }

      this._reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this._reconnectAttempts - 1), 30000);
      console.info(`[DeepgramClient] Reconnecting in ${delay}ms (attempt ${this._reconnectAttempts})`);

      this._reconnectTimer = setTimeout(() => {
        if (!this._stopping) this._connect();
      }, delay);
    }

    // ── Cleanup ───────────────────────────────────────────────────────────────

    _teardownAudioPipeline() {
      try {
        if (this._processorNode) {
          this._processorNode.disconnect();
          this._processorNode.onaudioprocess = null;
          this._processorNode = null;
        }
        if (this._sourceNode) {
          this._sourceNode.disconnect();
          this._sourceNode = null;
        }
        if (this._audioContext && this._audioContext.state !== 'closed') {
          this._audioContext.close();
          this._audioContext = null;
        }
      } catch (err) {
        console.warn('[DeepgramClient] Teardown warning:', err);
      }
    }

    _cleanup() {
      this._stopKeepalive();

      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }

      this._teardownAudioPipeline();

      if (this._ws) {
        // Send CloseStream before closing so Deepgram finalizes transcripts
        try {
          if (this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({ type: 'CloseStream' }));
          }
        } catch (_) {}

        try {
          this._ws.onopen = null;
          this._ws.onmessage = null;
          this._ws.onerror = null;
          this._ws.onclose = null;
          this._ws.close(1000, 'Stopped by user');
        } catch (_) {}

        this._ws = null;
      }

      // Stop the audio stream tracks
      if (this._audioStream) {
        this._audioStream.getTracks().forEach(t => t.stop());
        this._audioStream = null;
      }
    }

    _emitError(msg) {
      console.error(`[DeepgramClient] ${msg}`);
      if (typeof this.onError === 'function') this.onError(msg);
    }
  }

  // ─── Export ─────────────────────────────────────────────────────────────────

  window.DeepgramClient = DeepgramClient;
})();
