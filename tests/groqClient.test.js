import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/lib/ui.js', () => ({ showApiKeyStatus: vi.fn() }));
vi.mock('../src/lib/settings.js', () => ({
  get: vi.fn(),
  set: vi.fn(),
  remove: vi.fn(),
  KEYS: {
    API_KEY: 'api_key',
    API_PROVIDER: 'api_provider',
    GRADING_MODEL: 'groq_grading_model',
  },
}));
vi.mock('../src/lib/auth.js', () => ({
  isLoggedIn: vi.fn(),
  getAccessToken: vi.fn(),
}));

import { resolveAIRoute, hasAIAccess } from '../src/lib/ai/groqClient.js';
import * as settings from '../src/lib/settings.js';
import * as auth from '../src/lib/auth.js';

describe('resolveAIRoute', () => {
  beforeEach(() => vi.clearAllMocks());

  it('routes directly to Groq with a BYO key', () => {
    settings.get.mockReturnValue('gsk_mykey');
    auth.isLoggedIn.mockReturnValue(false);
    auth.getAccessToken.mockReturnValue(null);

    const route = resolveAIRoute();
    expect(route.chatUrl).toContain('api.groq.com');
    expect(route.transcribeUrl).toContain('api.groq.com');
    expect(route.headers.Authorization).toBe('Bearer gsk_mykey');
  });

  it('routes through the proxy when signed in without a key', () => {
    settings.get.mockReturnValue(null);
    auth.isLoggedIn.mockReturnValue(true);
    auth.getAccessToken.mockReturnValue('jwt_token');

    const route = resolveAIRoute();
    expect(route.chatUrl).toBe('/api/chat');
    expect(route.transcribeUrl).toBe('/api/transcribe');
    expect(route.headers.Authorization).toBe('Bearer jwt_token');
  });

  it('returns null with neither a key nor a session', () => {
    settings.get.mockReturnValue(null);
    auth.isLoggedIn.mockReturnValue(false);
    auth.getAccessToken.mockReturnValue(null);

    expect(resolveAIRoute()).toBeNull();
  });

  it('prefers the BYO key over the proxy when both are present', () => {
    settings.get.mockReturnValue('gsk_mykey');
    auth.isLoggedIn.mockReturnValue(true);
    auth.getAccessToken.mockReturnValue('jwt_token');

    expect(resolveAIRoute().headers.Authorization).toBe('Bearer gsk_mykey');
  });
});

describe('hasAIAccess', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is true with a BYO key', () => {
    settings.get.mockReturnValue('gsk_x');
    auth.isLoggedIn.mockReturnValue(false);
    expect(hasAIAccess()).toBe(true);
  });

  it('is true when signed in without a key', () => {
    settings.get.mockReturnValue(null);
    auth.isLoggedIn.mockReturnValue(true);
    expect(hasAIAccess()).toBe(true);
  });

  it('is false with neither', () => {
    settings.get.mockReturnValue(null);
    auth.isLoggedIn.mockReturnValue(false);
    expect(hasAIAccess()).toBe(false);
  });
});
