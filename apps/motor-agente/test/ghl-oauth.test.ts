import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildOauthIntegrationFields,
  exchangeCodeForTokens,
  GhlOauthError,
  refreshAccessToken,
} from '../src/lib/ghl-oauth.js';

// Asegurar la encryption key para que encryptWithDefault funcione en tests.
beforeEach(() => {
  if (!process.env.CREDENTIALS_ENCRYPTION_KEY) {
    process.env.CREDENTIALS_ENCRYPTION_KEY =
      '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff';
  }
});

function mockFetch(responseBody: unknown, status = 200): typeof fetch {
  return ((async () => {
    return new Response(typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown) as typeof fetch;
}

describe('exchangeCodeForTokens', () => {
  it('parses successful response into GhlOauthTokens', async () => {
    const tokens = await exchangeCodeForTokens({
      code: 'auth_code_xyz',
      clientId: 'client_id',
      clientSecret: 'client_secret',
      redirectUri: 'https://x.com/cb',
      fetchImpl: mockFetch({
        access_token: 'AT_123',
        refresh_token: 'RT_456',
        expires_in: 86400,
        scope: 'contacts.readonly conversations.readonly',
        userType: 'Location',
        locationId: 'LOC_AAA',
        companyId: 'COMP_ZZZ',
      }),
    });
    expect(tokens.accessToken).toBe('AT_123');
    expect(tokens.refreshToken).toBe('RT_456');
    expect(tokens.expiresIn).toBe(86400);
    expect(tokens.scope).toContain('contacts.readonly');
    expect(tokens.userType).toBe('Location');
    expect(tokens.locationId).toBe('LOC_AAA');
    expect(tokens.companyId).toBe('COMP_ZZZ');
    // expiresAt should be a future ISO date.
    expect(Date.parse(tokens.expiresAt)).toBeGreaterThan(Date.now());
  });

  it('throws GhlOauthError on HTTP error', async () => {
    const fetchImpl = mockFetch({ error: 'invalid_grant' }, 400);
    await expect(
      exchangeCodeForTokens({
        code: 'bad',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'https://x/cb',
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(GhlOauthError);
  });

  it('throws when response missing access_token / refresh_token', async () => {
    const fetchImpl = mockFetch({ access_token: 'AT', expires_in: 3600 }); // missing refresh_token
    await expect(
      exchangeCodeForTokens({
        code: 'c',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'https://x/cb',
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'GhlOauthError' });
  });

  it('throws when response is not valid JSON', async () => {
    const fetchImpl = mockFetch('<html>error</html>' as unknown as object);
    await expect(
      exchangeCodeForTokens({
        code: 'c',
        clientId: 'c',
        clientSecret: 's',
        redirectUri: 'https://x/cb',
        fetchImpl,
      }),
    ).rejects.toMatchObject({ name: 'GhlOauthError' });
  });

  it('defaults userType to Location when missing in response', async () => {
    const tokens = await exchangeCodeForTokens({
      code: 'c',
      clientId: 'c',
      clientSecret: 's',
      redirectUri: 'https://x/cb',
      fetchImpl: mockFetch({
        access_token: 'AT',
        refresh_token: 'RT',
        expires_in: 3600,
      }),
    });
    expect(tokens.userType).toBe('Location');
  });
});

describe('refreshAccessToken', () => {
  it('exchanges refresh_token for new tokens', async () => {
    const tokens = await refreshAccessToken({
      refreshToken: 'OLD_RT',
      clientId: 'c',
      clientSecret: 's',
      fetchImpl: mockFetch({
        access_token: 'NEW_AT',
        refresh_token: 'NEW_RT',
        expires_in: 86400,
        scope: 'contacts.readonly',
        userType: 'Location',
      }),
    });
    expect(tokens.accessToken).toBe('NEW_AT');
    expect(tokens.refreshToken).toBe('NEW_RT');
  });

  it('throws GhlOauthError on 401 (refresh token expired)', async () => {
    await expect(
      refreshAccessToken({
        refreshToken: 'expired',
        clientId: 'c',
        clientSecret: 's',
        fetchImpl: mockFetch({ error: 'invalid_grant' }, 401),
      }),
    ).rejects.toBeInstanceOf(GhlOauthError);
  });
});

describe('buildOauthIntegrationFields', () => {
  it('produces encrypted blob + plain connection_config', () => {
    const installedAt = '2026-05-08T10:00:00.000Z';
    const fields = buildOauthIntegrationFields(
      {
        accessToken: 'AT',
        refreshToken: 'RT',
        expiresIn: 86400,
        expiresAt: '2026-05-09T10:00:00.000Z',
        locationId: 'LOC',
        companyId: 'COMP',
        scope: 'contacts.readonly',
        userType: 'Location',
      },
      installedAt,
    );
    expect(fields.credentials_encrypted.blob).toMatch(/^v1:/);
    expect(fields.connection_config.auth_type).toBe('oauth');
    expect(fields.connection_config.locationId).toBe('LOC');
    expect(fields.connection_config.companyId).toBe('COMP');
    expect(fields.connection_config.scope).toBe('contacts.readonly');
    expect(fields.connection_config.userType).toBe('Location');
    expect(fields.connection_config.installedAt).toBe(installedAt);
    expect(fields.connection_config.expiresAt).toBe('2026-05-09T10:00:00.000Z');
  });

  it('omits locationId / companyId when undefined', () => {
    const fields = buildOauthIntegrationFields(
      {
        accessToken: 'AT',
        refreshToken: 'RT',
        expiresIn: 3600,
        expiresAt: '2026-05-09T10:00:00.000Z',
        scope: '',
        userType: 'Location',
      },
      '2026-05-08T10:00:00Z',
    );
    expect(fields.connection_config.locationId).toBeUndefined();
    expect(fields.connection_config.companyId).toBeUndefined();
  });
});
