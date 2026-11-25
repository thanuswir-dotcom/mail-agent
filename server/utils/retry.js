export class AbortError extends Error {
  constructor(message = 'Operation aborted by user') {
    super(message)
    this.name = 'AbortError'
    this.isAbort = true
  }
}

export function isTransientError(error) {
  if (!error) return false
  if (error.isAbort || error.name === 'AbortError') return false
  const status = error.status || error.code || error.response?.status
  if ([429, 500, 502, 503, 504].includes(Number(status))) {
    return true
  }
  const msg = String(error.message || '').toLowerCase()
  return (
    msg.includes('rate limit') ||
    msg.includes('quota') ||
    msg.includes('timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('503') ||
    msg.includes('429')
  )
}

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AbortError())
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timer)
      reject(new AbortError())
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Executes an async operation with exponential backoff retries and abort awareness.
 */
export async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    baseDelayMs = 400,
    signal,
    onRetry,
    shouldRetry = isTransientError,
  } = options

  let attempt = 0
  let lastError

  while (attempt < maxAttempts) {
    if (signal?.aborted) {
      throw new AbortError()
    }
    attempt += 1
    try {
      const value = await fn(attempt)
      return { value, attempts: attempt }
    } catch (error) {
      lastError = error
      if (error.isAbort || error.name === 'AbortError' || signal?.aborted) {
        throw new AbortError()
      }
      if (attempt >= maxAttempts || !shouldRetry(error)) {
        error.attempts = attempt
        throw error
      }
      const delayMs = baseDelayMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 100)
      if (onRetry) {
        await onRetry({ attempt, maxAttempts, delayMs, error })
      }
      await sleep(delayMs, signal)
    }
  }

  throw lastError
}

