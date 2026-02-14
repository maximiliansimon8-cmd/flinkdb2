/**
 * voiceResponseProcessor.js
 *
 * Transforms AI text responses (optimized for reading) into
 * speech-friendly text for the Web Speech Synthesis API.
 *
 * - Strips markdown formatting
 * - Converts bullet points to ordinal speech ("Erstens..., Zweitens...")
 * - Shortens overly long responses with a follow-up prompt
 * - Converts table-like data to spoken summaries
 * - Adds natural pauses via punctuation
 */

const ORDINALS_DE = [
  'Erstens', 'Zweitens', 'Drittens', 'Viertens', 'Fünftens',
  'Sechstens', 'Siebtens', 'Achtens', 'Neuntens', 'Zehntens',
];

/**
 * Strip all markdown formatting from text.
 */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    // Headers
    .replace(/^#{1,6}\s+/gm, '')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '$1')
    // Italic
    .replace(/\*(.+?)\*/g, '$1')
    // Inline code
    .replace(/`([^`]+)`/g, '$1')
    // Links [text](url) → text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Horizontal rules
    .replace(/^[-*_]{3,}\s*$/gm, '')
    // Emoji sequences at line starts
    .replace(/^[\u{26A1}\u{1F49A}\u{1F4C8}\u{1F6A8}\u{1F4CB}\u{1F50D}\u{2705}\u{274C}\u{26A0}\u{FE0F}\u{1F3AF}\u{1F4CA}\u{1F4A1}\u{1F527}\u{1F4CC}]+\s*/gmu, '')
    // Collapse excessive newlines
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert bullet-point lists into ordinal speech.
 * "- Point A\n- Point B" → "Erstens, Point A. Zweitens, Point B."
 */
function convertBulletsToSpeech(text) {
  const lines = text.split('\n');
  const result = [];
  let bulletIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^[-*]\s+(.*)/);
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.*)/);

    if (bulletMatch || numberedMatch) {
      const content = (bulletMatch || numberedMatch)[1];
      const ordinal = ORDINALS_DE[bulletIndex] || `Punkt ${bulletIndex + 1}`;
      result.push(`${ordinal}, ${content}.`);
      bulletIndex++;
    } else {
      // Reset bullet counter when we leave a list
      if (bulletIndex > 0) bulletIndex = 0;
      result.push(trimmed);
    }
  }

  return result.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Clean up numbers and abbreviations for better pronunciation.
 */
function cleanForSpeech(text) {
  return text
    // Percentages: "85%" → "85 Prozent"
    .replace(/(\d+(?:[.,]\d+)?)\s*%/g, '$1 Prozent')
    // Common abbreviations
    .replace(/\bz\.B\./gi, 'zum Beispiel')
    .replace(/\bbzw\./gi, 'beziehungsweise')
    .replace(/\bca\./gi, 'circa')
    .replace(/\bd\.h\./gi, 'das heißt')
    .replace(/\bu\.a\./gi, 'unter anderem')
    .replace(/\bggf\./gi, 'gegebenenfalls')
    // Remove parenthetical display IDs like (JET-12345)
    .replace(/\(JET-\d+\)/g, '')
    // Clean up double spaces
    .replace(/\s{2,}/g, ' ')
    // Ensure sentences end properly
    .replace(/([a-zA-Z\u00C0-\u024F])\s*\n/g, '$1. ')
    .trim();
}

/**
 * Count words in a string.
 */
function wordCount(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Main processor: transform AI response text for voice output.
 *
 * @param {string} text - Raw AI response (may contain markdown)
 * @param {object} options
 * @param {number} options.maxWords - Max words before truncation (default: 200)
 * @returns {{ spokenText: string, wasTruncated: boolean }}
 */
export function processForVoice(text, { maxWords = 200 } = {}) {
  if (!text) return { spokenText: '', wasTruncated: false };

  // Step 1: Strip markdown
  let processed = stripMarkdown(text);

  // Step 2: Convert bullets to ordinal speech
  processed = convertBulletsToSpeech(processed);

  // Step 3: Clean abbreviations and numbers
  processed = cleanForSpeech(processed);

  // Step 4: Truncate if too long
  let wasTruncated = false;
  const words = processed.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    // Find a sentence boundary near maxWords
    const truncated = words.slice(0, maxWords).join(' ');
    const lastPeriod = truncated.lastIndexOf('.');
    const cutPoint = lastPeriod > truncated.length * 0.6 ? lastPeriod + 1 : truncated.length;
    processed = truncated.slice(0, cutPoint).trim();
    if (!processed.endsWith('.')) processed += '.';
    processed += ' Soll ich ins Detail gehen?';
    wasTruncated = true;
  }

  return { spokenText: processed, wasTruncated };
}

/**
 * Parse voice commands that should be handled locally
 * instead of sending to the AI.
 *
 * @param {string} transcript - User's spoken text
 * @returns {{ isCommand: boolean, action: string|null, param: string|null }}
 */
export function parseVoiceCommand(transcript) {
  if (!transcript) return { isCommand: false, action: null, param: null };

  const t = transcript.toLowerCase().trim();

  // Navigation commands
  if (/^(stop|stopp|pause|halt|anhalten)$/i.test(t)) {
    return { isCommand: true, action: 'stop', param: null };
  }
  if (/^(zurück|back)$/i.test(t)) {
    return { isCommand: true, action: 'back', param: null };
  }

  // "Zeig mir [Standort]"
  const showMatch = t.match(/^zeig\s+mir\s+(.+)/i);
  if (showMatch) {
    return { isCommand: true, action: 'show', param: showMatch[1].trim() };
  }

  // "Öffne Tasks"
  if (/^öffne\s+tasks?$/i.test(t)) {
    return { isCommand: true, action: 'openTasks', param: null };
  }

  // "Wie ist der Status von [Stadt]?"
  const statusMatch = t.match(/(?:status|zustand)\s+(?:von\s+)?(.+?)[\s?]*$/i);
  if (statusMatch) {
    return { isCommand: true, action: 'status', param: statusMatch[1].trim() };
  }

  return { isCommand: false, action: null, param: null };
}

export default processForVoice;
