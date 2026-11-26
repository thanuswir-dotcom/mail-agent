import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react'

export function VoiceMicButton({
  isListening,
  onClick,
  supported = true,
  label = 'Voice Dictate',
  stopLabel = 'Stop Listening',
  size = 'md',
}) {
  const padding = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
  return (
    <button
      type="button"
      onClick={onClick}
      title={supported ? (isListening ? stopLabel : label) : 'Voice recognition unavailable in this browser'}
      className={`inline-flex items-center gap-1.5 rounded-xl font-semibold transition border ${padding} ${
        isListening
          ? 'bg-rose-600 text-white border-rose-600 shadow-sm shadow-rose-500/30 animate-pulse'
          : 'bg-[var(--card-elevated)] text-[var(--text)] border-[var(--border)] hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50/70 dark:hover:bg-blue-950/40'
      }`}
    >
      {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />}
      <span>{isListening ? stopLabel : label}</span>
    </button>
  )
}

export function VoiceSpeakButton({
  isSpeaking,
  onSpeak,
  onStop,
  label = 'Read Aloud',
  size = 'sm',
}) {
  const padding = size === 'sm' ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-xs sm:text-sm'
  return (
    <button
      type="button"
      onClick={isSpeaking ? onStop : onSpeak}
      className={`inline-flex items-center gap-1.5 rounded-xl font-semibold transition border ${padding} ${
        isSpeaking
          ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
          : 'bg-[var(--card-elevated)] text-[var(--text)] border-[var(--border)] hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50/70 dark:hover:bg-emerald-950/40'
      }`}
    >
      {isSpeaking ? (
        <VolumeX className="w-3.5 h-3.5" />
      ) : (
        <Volume2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
      )}
      <span>{isSpeaking ? 'Stop Audio' : label}</span>
    </button>
  )
}
