import { useCallback, useEffect, useRef, useState } from 'react'

const STRIP_EMOJI_REGEX = /(?:\p{Extended_Pictographic}|\uFE0F|\u200D|\u20E3)/gu

export function cleanTextForSpeech(text = '') {
  return String(text || '')
    .replace(STRIP_EMOJI_REGEX, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function useVoiceAssistant({ onTranscript } = {}) {
  const speechSupported =
    typeof window !== 'undefined' &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window

  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [voiceError, setVoiceError] = useState('')

  const recognitionRef = useRef(null)
  const onTranscriptRef = useRef(onTranscript)

  useEffect(() => {
    onTranscriptRef.current = onTranscript
  }, [onTranscript])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop()
      } catch {
        // Ignore cleanup errors
      }
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const stopListening = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      // Ignore stop errors
    }
    setIsListening(false)
    setInterimTranscript('')
  }, [])

  const startListening = useCallback(() => {
    setVoiceError('')
    if (!speechSupported) {
      setVoiceError('Voice dictation requires a Chromium/Edge/Safari browser supporting Speech Recognition.')
      return
    }

    if (isListening) {
      stopListening()
      return
    }

    try {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new Recognition()
      recognition.lang = 'en-US'
      recognition.interimResults = true
      recognition.continuous = false
      recognition.maxAlternatives = 1

      recognition.onstart = () => {
        setIsListening(true)
        setInterimTranscript('')
      }

      recognition.onresult = (event) => {
        let finalText = ''
        let interim = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const piece = event.results[i][0]?.transcript || ''
          if (event.results[i].isFinal) {
            finalText += `${piece} `
          } else {
            interim += piece
          }
        }
        setInterimTranscript(interim.trim())
        if (finalText.trim() && onTranscriptRef.current) {
          onTranscriptRef.current(finalText.trim())
        }
      }

      recognition.onerror = (event) => {
        const code = event?.error || 'unknown'
        if (code !== 'aborted' && code !== 'no-speech') {
          setVoiceError(`Microphone error: ${code}. Check browser mic permissions.`)
        }
        setIsListening(false)
        setInterimTranscript('')
      }

      recognition.onend = () => {
        setIsListening(false)
        setInterimTranscript('')
      }

      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      setVoiceError(err.message || 'Could not start voice dictation.')
      setIsListening(false)
    }
  }, [isListening, speechSupported, stopListening])

  const stopSpeaking = useCallback(() => {
    if (!ttsSupported) return
    window.speechSynthesis.cancel()
    setIsSpeaking(false)
  }, [ttsSupported])

  const speak = useCallback(
    (text) => {
      setVoiceError('')
      if (!ttsSupported) {
        setVoiceError('Text-to-speech playback is not supported in this browser.')
        return
      }
      const cleaned = cleanTextForSpeech(text)
      if (!cleaned) return

      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(cleaned)
      utterance.rate = 1.02
      utterance.pitch = 1
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      window.speechSynthesis.speak(utterance)
    },
    [ttsSupported]
  )

  return {
    speechSupported,
    ttsSupported,
    isListening,
    isSpeaking,
    interimTranscript,
    voiceError,
    startListening,
    stopListening,
    speak,
    stopSpeaking,
  }
}
