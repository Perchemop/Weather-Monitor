/**
 * Pure utilities for the in-app crash/bug report submission flow (design B).
 *
 * Contains the GitHub device-flow poll state machine and the payload scrubber.
 * No network, storage, or React dependencies — safe to unit-test directly.
 */

export type PollState = 'pending' | 'slow_down' | 'done' | 'expired' | 'denied' | 'error'

export interface TokenPollResponse {
  access_token?: string
  token_type?: string
  scope?: string
  error?: string
  error_description?: string
  interval?: number
}

export interface PollResult {
  state: PollState
  token?: string
  interval?: number
  message?: string
}

/**
 * Classify a single token-endpoint response. Pure function of the response.
 */
export function classifyPollResponse(resp: TokenPollResponse | null | undefined): PollResult {
  if (!resp) {
    return { state: 'error', message: 'Empty response from GitHub.' }
  }
  if (resp.access_token) {
    return { state: 'done', token: resp.access_token }
  }
  switch (resp.error) {
    case 'authorization_pending':
      return { state: 'pending', interval: resp.interval }
    case 'slow_down':
      return { state: 'slow_down', interval: (resp.interval ?? 5) + 5 }
    case 'expired_token':
      return { state: 'expired', message: 'Device code expired. Please start over.' }
    case 'access_denied':
      return { state: 'denied', message: 'Authorization was denied.' }
    default:
      return {
        state: 'error',
        message: resp.error_description || resp.error || 'Unknown error polling GitHub.',
      }
  }
}

export function scrubText(input: string): string {
  if (!input) return ''
  let out = input
  // Redact absolute paths (Unix and Windows).
  out = out.replace(/[A-Za-z]:\\[^\s"'<>]+/g, '[REDACTED_PATH]')
  out = out.replace(/\/(?:[^\s"'<>]+\/)+[^\s"'<>]+/g, '[REDACTED_PATH]')
  // Redact token-like strings.
  out = out.replace(/ghp_[A-Za-z0-9]{20,}/g, '[REDACTED_TOKEN]')
  out = out.replace(/github_pat_[A-Za-z0-9_]{20,}/g, '[REDACTED_TOKEN]')
  out = out.replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[REDACTED_TOKEN]')
  // Redact 32-char hex.
  out = out.replace(/\b[a-f0-9]{32}\b/gi, '[REDACTED_TOKEN]')
  return out
}

export type ReportKind = 'bug' | 'crash'

export interface ReportContext {
  appVersion: string
  buildMode: string
  userAgent: string
  error?: { message?: string; stack?: string }
  notes?: string
}

export interface ReportPayload {
  title: string
  body: string
  labels: string[]
}

export function buildReportPayload(ctx: ReportContext, kind: ReportKind = 'bug'): ReportPayload {
  const label = kind === 'crash' ? 'crash' : 'bug'
  const titlePrefix = kind === 'crash' ? '[crash]' : '[bug]'
  const message = ctx.error?.message ? scrubText(ctx.error.message) : ''
  const title = message ? `${titlePrefix} ${message.slice(0, 80)}` : `${titlePrefix} report`
  const stack = ctx.error?.stack ? scrubText(ctx.error.stack) : ''
  const notes = ctx.notes ? scrubText(ctx.notes) : ''
  const body = [
    '### Description',
    notes || '(no additional notes)',
    '',
    '### Error',
    message ? `**Message:** ${message}` : '(none)',
    stack ? `\`\`\`\n${stack}\n\`\`\`` : '',
    '',
    '### Environment',
    `- App version: ${ctx.appVersion}`,
    `- Mode: ${ctx.buildMode}`,
    `- Browser: ${scrubText(ctx.userAgent || 'unknown')}`,
    '',
    '> Reviewed by operator before submission. Do not include passwords, tokens, or site locations.',
  ]
    .filter((l) => l !== '')
    .join('\n')
  return { title, body, labels: [label] }
}

export function isConfigured(clientId: string | undefined): boolean {
  return Boolean(clientId && clientId.trim().length > 0)
}
