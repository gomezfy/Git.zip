import { describe, it, expect, beforeEach } from '@jest/globals';

// Test path validation
function isValidPath(path: string): boolean {
  if (!path || typeof path !== 'string') return false;
  
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return false;
  }
  
  const dangerousPatterns = [
    /\.\./,
    /%2e%2e/i,
    /%252e%252e/i,
    /\.\%2e/i,
    /%2e\./i,
    /\0/,
    /[\x00-\x1f]/,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(path) || pattern.test(decoded)) {
      return false;
    }
  }
  
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    return false;
  }
  
  if (path.includes('\\')) {
    return false;
  }
  
  return true;
}

// Test error sanitization
function sanitizeErrorMessage(error: any): string {
  if (!error) return 'Unknown error';
  
  let message = error.message || String(error);
  
  message = message.replace(/gh[ps]_[a-zA-Z0-9]{36,}/g, '[REDACTED_TOKEN]');
  message = message.replace(/[A-Za-z0-9_-]{24}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,}/g, '[REDACTED_TOKEN]');
  message = message.replace(/secret[=:]\s*[^\s]+/gi, 'secret=[REDACTED]');
  message = message.replace(/key[=:]\s*[^\s]+/gi, 'key=[REDACTED]');
  message = message.replace(/password[=:]\s*[^\s]+/gi, 'password=[REDACTED]');
  message = message.replace(/\/home\/[^\s]+/g, '[PATH]');
  message = message.replace(/C:\\Users\\[^\s]+/g, '[PATH]');
  
  if (message.length > 500) {
    message = message.substring(0, 500) + '... [truncated]';
  }
  
  return message;
}

describe('Security - Path Validation', () => {
  it('should accept valid relative paths', () => {
    expect(isValidPath('folder/file.txt')).toBe(true);
    expect(isValidPath('my-project/src/index.js')).toBe(true);
    expect(isValidPath('simple.txt')).toBe(true);
  });

  it('should reject path traversal attempts', () => {
    expect(isValidPath('../etc/passwd')).toBe(false);
    expect(isValidPath('folder/../../../etc/passwd')).toBe(false);
    expect(isValidPath('../../secret')).toBe(false);
  });

  it('should reject URL-encoded path traversal', () => {
    expect(isValidPath('%2e%2e/etc/passwd')).toBe(false);
    expect(isValidPath('%252e%252e/etc/passwd')).toBe(false);
    expect(isValidPath('.%2e/etc/passwd')).toBe(false);
    expect(isValidPath('%2e./etc/passwd')).toBe(false);
  });

  it('should reject absolute paths', () => {
    expect(isValidPath('/etc/passwd')).toBe(false);
    expect(isValidPath('/home/user/file')).toBe(false);
    expect(isValidPath('C:\\Windows\\System32')).toBe(false);
    expect(isValidPath('D:\\Users\\file.txt')).toBe(false);
  });

  it('should reject paths with backslashes', () => {
    expect(isValidPath('folder\\file.txt')).toBe(false);
    expect(isValidPath('path\\to\\file')).toBe(false);
  });

  it('should reject paths with null bytes', () => {
    expect(isValidPath('file\0.txt')).toBe(false);
    expect(isValidPath('folder/\0/file')).toBe(false);
  });

  it('should reject paths with control characters', () => {
    expect(isValidPath('file\x01.txt')).toBe(false);
    expect(isValidPath('folder\x1f/file')).toBe(false);
  });

  it('should reject invalid input types', () => {
    expect(isValidPath('')).toBe(false);
    expect(isValidPath(null as any)).toBe(false);
    expect(isValidPath(undefined as any)).toBe(false);
  });
});

describe('Security - Error Message Sanitization', () => {
  it('should redact GitHub tokens', () => {
    const error = new Error('Failed with token ghp_1234567890123456789012345678901234567890');
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toContain('[REDACTED_TOKEN]');
    expect(sanitized).not.toContain('ghp_');
  });

  it('should redact Discord bot tokens', () => {
    // Using a fake token format that matches the pattern (24.6.27+ chars)
    const fakeToken = 'AbCdEfGhIjKlMnOpQrStUvWx.YzAbCd.EfGhIjKlMnOpQrStUvWxYzAbCdE';
    const error = new Error(`Bot token: ${fakeToken}`);
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized).toContain('[REDACTED_TOKEN]');
    expect(sanitized).not.toContain('AbCdEfGhIjKlMnOpQrStUvWx');
  });

  it('should redact secrets and keys', () => {
    expect(sanitizeErrorMessage(new Error('secret=mysecret123'))).toContain('secret=[REDACTED]');
    expect(sanitizeErrorMessage(new Error('key: mykey456'))).toContain('key=[REDACTED]');
    expect(sanitizeErrorMessage(new Error('password=pass123'))).toContain('password=[REDACTED]');
  });

  it('should redact file paths', () => {
    expect(sanitizeErrorMessage(new Error('Error in /home/user/.env'))).toContain('[PATH]');
    expect(sanitizeErrorMessage(new Error('Error in C:\\Users\\user\\secrets.txt'))).toContain('[PATH]');
  });

  it('should truncate long messages', () => {
    const longMessage = 'a'.repeat(600);
    const error = new Error(longMessage);
    const sanitized = sanitizeErrorMessage(error);
    expect(sanitized.length).toBeLessThanOrEqual(520); // 500 + "... [truncated]"
    expect(sanitized).toContain('[truncated]');
  });

  it('should handle null and undefined errors', () => {
    expect(sanitizeErrorMessage(null)).toBe('Unknown error');
    expect(sanitizeErrorMessage(undefined)).toBe('Unknown error');
  });

  it('should handle errors without message property', () => {
    const sanitized = sanitizeErrorMessage('string error');
    expect(sanitized).toBe('string error');
  });
});

describe('Security - Rate Limiting', () => {
  interface RateLimitEntry {
    lastCommand: number;
    commandCount: number;
    resetTime: number;
  }

  const rateLimitMap = new Map<string, RateLimitEntry>();
  const RATE_LIMIT_WINDOW = 60000;
  const MAX_COMMANDS_PER_WINDOW = 10;
  const COOLDOWN_BETWEEN_COMMANDS = 2000;

  function checkRateLimit(userId: string): { allowed: boolean; retryAfter?: number } {
    const now = Date.now();
    const entry = rateLimitMap.get(userId);
    
    if (!entry) {
      rateLimitMap.set(userId, {
        lastCommand: now,
        commandCount: 1,
        resetTime: now + RATE_LIMIT_WINDOW
      });
      return { allowed: true };
    }
    
    if (now > entry.resetTime) {
      entry.commandCount = 1;
      entry.resetTime = now + RATE_LIMIT_WINDOW;
      entry.lastCommand = now;
      return { allowed: true };
    }
    
    const timeSinceLastCommand = now - entry.lastCommand;
    if (timeSinceLastCommand < COOLDOWN_BETWEEN_COMMANDS) {
      return { 
        allowed: false, 
        retryAfter: Math.ceil((COOLDOWN_BETWEEN_COMMANDS - timeSinceLastCommand) / 1000)
      };
    }
    
    if (entry.commandCount >= MAX_COMMANDS_PER_WINDOW) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return { allowed: false, retryAfter };
    }
    
    entry.commandCount++;
    entry.lastCommand = now;
    return { allowed: true };
  }

  beforeEach(() => {
    rateLimitMap.clear();
  });

  it('should allow first command', () => {
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(true);
  });

  it('should enforce cooldown between commands', () => {
    checkRateLimit('user1');
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should allow command after cooldown', async () => {
    checkRateLimit('user1');
    await new Promise(resolve => setTimeout(resolve, 2100));
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(true);
  });

  it('should track separate limits per user', () => {
    const result1 = checkRateLimit('user1');
    const result2 = checkRateLimit('user2');
    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
  });

  it('should reset counter after window expires', () => {
    const entry: RateLimitEntry = {
      lastCommand: Date.now() - 70000,
      commandCount: 10,
      resetTime: Date.now() - 10000
    };
    rateLimitMap.set('user1', entry);
    
    const result = checkRateLimit('user1');
    expect(result.allowed).toBe(true);
  });
});
