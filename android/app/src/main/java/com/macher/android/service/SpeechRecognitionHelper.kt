package com.macher.android.service

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.macher.android.util.Logger

/**
 * Wraps Android SpeechRecognizer for continuous on-device transcription during calls.
 * Automatically restarts recognition after each result or error so that it runs
 * continuously until [stop] is called.
 *
 * Results are delivered via [onResult] callback with the recognized text and
 * whether it is a final (stable) or partial result.
 */
class SpeechRecognitionHelper(private val context: Context) {

    private var recognizer: SpeechRecognizer? = null
    private val mainHandler = Handler(Looper.getMainLooper())
    private var running = false
    var onResult: ((text: String, isFinal: Boolean) -> Unit)? = null

    /** Start continuous recognition. Must be called on Main thread or will post to it. */
    fun start() {
        if (running) return
        running = true
        mainHandler.post { startInternal() }
    }

    /** Stop recognition and release resources. */
    fun stop() {
        running = false
        mainHandler.post {
            try {
                recognizer?.stopListening()
                recognizer?.cancel()
                recognizer?.destroy()
            } catch (e: Exception) {
                Logger.warn("SpeechHelper", "Error stopping recognizer: ${e.message}")
            }
            recognizer = null
        }
    }

    private fun startInternal() {
        if (!running) return
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Logger.error("SpeechHelper", "Speech recognition not available on this device")
            return
        }

        try {
            recognizer?.destroy()
            recognizer = SpeechRecognizer.createSpeechRecognizer(context).apply {
                setRecognitionListener(listener)
            }
            recognizer?.startListening(createIntent())
            Logger.info("SpeechHelper", "Speech recognition started")
        } catch (e: Exception) {
            Logger.error("SpeechHelper", "Failed to start speech recognition", e)
            scheduleRestart()
        }
    }

    private fun createIntent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-US")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
        // Keep listening for a long time (default is ~5s of silence)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 10000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 8000L)
        putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_MINIMUM_LENGTH_MILLIS, 30000L)
    }

    private fun scheduleRestart() {
        if (!running) return
        mainHandler.postDelayed({ startInternal() }, 500)
    }

    private val listener = object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
            Logger.debug("SpeechHelper", "Ready for speech")
        }

        override fun onBeginningOfSpeech() {}

        override fun onRmsChanged(rmsdB: Float) {}

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {
            Logger.debug("SpeechHelper", "End of speech segment")
        }

        override fun onError(error: Int) {
            val errorName = when (error) {
                SpeechRecognizer.ERROR_AUDIO -> "ERROR_AUDIO"
                SpeechRecognizer.ERROR_CLIENT -> "ERROR_CLIENT"
                SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "ERROR_PERMISSIONS"
                SpeechRecognizer.ERROR_NETWORK -> "ERROR_NETWORK"
                SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "ERROR_NETWORK_TIMEOUT"
                SpeechRecognizer.ERROR_NO_MATCH -> "ERROR_NO_MATCH"
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "ERROR_BUSY"
                SpeechRecognizer.ERROR_SERVER -> "ERROR_SERVER"
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "ERROR_SPEECH_TIMEOUT"
                else -> "UNKNOWN($error)"
            }
            when (error) {
                SpeechRecognizer.ERROR_NO_MATCH,
                SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> {
                    // Normal during silence — restart quickly
                    Logger.debug("SpeechHelper", "No speech detected, restarting...")
                    scheduleRestart()
                }
                SpeechRecognizer.ERROR_AUDIO -> {
                    // Mic locked by telephony — avoid 500ms busy loop, retry after 5s
                    Logger.warn("SpeechHelper", "Mic unavailable (ERROR_AUDIO) — retry in 5s")
                    if (running) mainHandler.postDelayed({ startInternal() }, 5000L)
                }
                SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> {
                    // Recognizer busy — wait a bit longer
                    Logger.warn("SpeechHelper", "Recognizer busy — retry in 2s")
                    if (running) mainHandler.postDelayed({ startInternal() }, 2000L)
                }
                else -> {
                    Logger.warn("SpeechHelper", "Recognition error: $errorName")
                    scheduleRestart()
                }
            }
        }

        override fun onResults(results: Bundle?) {
            val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val text = matches?.firstOrNull() ?: ""
            if (text.isNotEmpty()) {
                Logger.info("SpeechHelper", "Final: $text")
                onResult?.invoke(text, true)
            }
            // Restart for continuous recognition
            scheduleRestart()
        }

        override fun onPartialResults(partialResults: Bundle?) {
            val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
            val text = matches?.firstOrNull() ?: ""
            if (text.isNotEmpty()) {
                onResult?.invoke(text, false)
            }
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }
}
