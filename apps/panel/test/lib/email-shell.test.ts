import { describe, it, expect } from 'vitest';
import {
  renderEmailShell,
  renderEmailPlainText,
  escapeHtml,
  FYZON_LOGO_URL,
} from '@/lib/email/templates/_shell';

describe('email shell — escapeHtml', () => {
  it('escapes the five html-sensitive chars', () => {
    expect(escapeHtml('<script>&"\'</script>')).toBe(
      '&lt;script&gt;&amp;&quot;&#39;&lt;/script&gt;',
    );
  });

  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('leaves safe text untouched', () => {
    expect(escapeHtml('Fyzon Setters 2026')).toBe('Fyzon Setters 2026');
  });
});

describe('email shell — renderEmailShell', () => {
  it('renders minimum HTML with title + body', () => {
    const html = renderEmailShell({
      audience: 'trainer',
      variant: 'generic',
      title: 'Hola Iván',
      body: '<p>Cuerpo del mensaje.</p>',
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('Hola Iván');
    expect(html).toContain('<p>Cuerpo del mensaje.</p>');
    expect(html).toContain(FYZON_LOGO_URL);
    expect(html).toContain('Recibes este email como cliente de Fyzon Setters.');
  });

  it('renders badge when provided', () => {
    const html = renderEmailShell({
      audience: 'admin',
      variant: 'invite',
      title: 'Te invitan',
      badge: 'Acceso interno Fyzon',
      body: '<p>x</p>',
    });
    expect(html).toContain('Acceso interno Fyzon');
    expect(html).toContain('Recibes este email como administrador interno');
  });

  it('renders CTA + copy URL block when cta provided', () => {
    const html = renderEmailShell({
      audience: 'trainer',
      variant: 'reset',
      title: 'Recupera tu contraseña',
      body: '<p>x</p>',
      cta: { url: 'https://panel.fyzon.es/reset?token=abc', label: 'Cambiar contraseña' },
    });
    expect(html).toContain('https://panel.fyzon.es/reset?token=abc');
    expect(html).toContain('Cambiar contraseña');
    expect(html).toContain('Si el botón no funciona');
  });

  it('omits copy URL when showCopyUrl=false', () => {
    const html = renderEmailShell({
      audience: 'trainer',
      variant: 'notification',
      title: 'Aviso',
      body: '<p>x</p>',
      cta: { url: 'https://panel.fyzon.es/x', label: 'Ver' },
      showCopyUrl: false,
    });
    expect(html).not.toContain('Si el botón no funciona');
  });

  it('escapes title and badge but NOT body (body is trusted HTML)', () => {
    const html = renderEmailShell({
      audience: 'admin',
      variant: 'invite',
      title: '<script>alert(1)</script>',
      badge: '<b>x</b>',
      body: '<p>This <strong>is trusted</strong> HTML</p>',
    });
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toMatch(/<script>alert\(1\)<\/script>/);
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('<strong>is trusted</strong>');
  });

  it('renders preheader as hidden div', () => {
    const html = renderEmailShell({
      audience: 'lead',
      variant: 'notification',
      title: 'Tienes un mensaje',
      preheader: 'Un setter de Fyzon quiere contactarte',
      body: '<p>x</p>',
    });
    expect(html).toContain('Un setter de Fyzon quiere contactarte');
    expect(html).toContain('display:none');
  });

  it('renders manage-notifications link when manageNotificationsUrl is set', () => {
    const html = renderEmailShell({
      audience: 'trainer',
      variant: 'notification',
      title: 'Lead cualificado',
      body: '<p>x</p>',
      manageNotificationsUrl: 'https://panel.fyzon.es/settings/preferences',
    });
    expect(html).toContain('Gestionar mis notificaciones');
    expect(html).toContain('https://panel.fyzon.es/settings/preferences');
  });

  it('renders custom footerText override', () => {
    const html = renderEmailShell({
      audience: 'trainer',
      variant: 'generic',
      title: 'x',
      body: '<p>y</p>',
      footerText: 'Custom footer override',
    });
    expect(html).toContain('Custom footer override');
    expect(html).not.toContain('Recibes este email como cliente');
  });
});

describe('email shell — renderEmailPlainText', () => {
  it('produces a plain-text version', () => {
    const text = renderEmailPlainText({
      title: 'Recupera tu contraseña',
      bodyText: 'Hemos recibido tu solicitud.',
      cta: { url: 'https://panel.fyzon.es/x', label: 'Cambiar contraseña' },
      disclaimer: 'Si no fuiste tú, ignora este email.',
    });
    expect(text).toContain('Recupera tu contraseña');
    expect(text).toContain('==');
    expect(text).toContain('Cambiar contraseña: https://panel.fyzon.es/x');
    expect(text).toContain('Si no fuiste tú, ignora este email.');
    expect(text).toContain('Fyzon · Setters IA');
  });
});
