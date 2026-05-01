import { describe, it, expect } from 'vitest';
import { validateMessage, type ValidationContext } from '../src/index.js';

const baseCtx: ValidationContext = {
  tenantId: 2,
  conversationId: 1,
  currentPhase: 2,
  channel: 'instagram',
  emojisWhitelist: ['💪', '😂', '😅', '🔥'],
  isFirstAssistantMessage: false,
  lastAssistantMessages: [],
  locale: 'es-VE',
};

describe('validator V00 empty', () => {
  it('reports error on empty', () => {
    const r = validateMessage('', baseCtx);
    expect(r.hasErrors).toBe(true);
    expect(r.violations[0]?.ruleId).toBe('V00');
  });
  it('reports error on whitespace only', () => {
    const r = validateMessage('   \n\t  ', baseCtx);
    expect(r.hasErrors).toBe(true);
  });
  it('passes on real text', () => {
    const r = validateMessage('Hola pana', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V00')).toBeUndefined();
  });
});

describe('validator V01 greeting repeat', () => {
  it('warns on repeated greeting after first message', () => {
    const r = validateMessage('Hola pana, ¿qué tal todo?', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V01' && v.severity === 'warn')).toBe(true);
  });
  it('allows greeting on first message', () => {
    const r = validateMessage('Hola pana, ¿qué tal?', { ...baseCtx, isFirstAssistantMessage: true });
    expect(r.violations.find((v) => v.ruleId === 'V01')).toBeUndefined();
  });
  it('does not flag non-greetings', () => {
    const r = validateMessage('Verga eso tiene que ser frustrante', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V01')).toBeUndefined();
  });
});

describe('validator V02 emoji whitelist', () => {
  it('warns on emojis outside whitelist', () => {
    const r = validateMessage('Te quiero ❤️ mucho', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V02')).toBe(true);
  });
  it('passes whitelisted emojis', () => {
    const r = validateMessage('Brutal 💪 vamos!', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V02')).toBeUndefined();
  });
  it('skips when whitelist is null/empty', () => {
    const r = validateMessage('Te quiero ❤️ mucho', { ...baseCtx, emojisWhitelist: null });
    expect(r.violations.find((v) => v.ruleId === 'V02')).toBeUndefined();
  });
});

describe('validator V03 length', () => {
  it('warns on >280 chars', () => {
    const r = validateMessage('a'.repeat(300), baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V03')).toBe(true);
  });
  it('passes ≤280 chars', () => {
    const r = validateMessage('a'.repeat(280), baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V03')).toBeUndefined();
  });
});

describe('validator V04 ai mention', () => {
  it('errors on "soy una IA"', () => {
    const r = validateMessage('La verdad es que soy una IA, perdona', baseCtx);
    expect(r.hasErrors).toBe(true);
    expect(r.violations.find((v) => v.ruleId === 'V04')?.severity).toBe('error');
  });
  it('errors on Claude mention', () => {
    const r = validateMessage('Hola, soy Claude', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V04')).toBe(true);
  });
  it('does not false-positive on similar Spanish words', () => {
    const r = validateMessage('Esto sería ideal porque es óptimo', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V04')).toBeUndefined();
  });
});

describe('validator V05 premature goodbye', () => {
  it('warns on goodbye before phase 5', () => {
    const r = validateMessage('Un placer haberte conocido. Hasta luego', { ...baseCtx, currentPhase: 2 });
    expect(r.violations.some((v) => v.ruleId === 'V05')).toBe(true);
  });
  it('allows goodbye in phase 5+', () => {
    const r = validateMessage('Un saludo y nos vemos en la llamada', { ...baseCtx, currentPhase: 5 });
    expect(r.violations.find((v) => v.ruleId === 'V05')).toBeUndefined();
  });
});

describe('validator V06 multi-question', () => {
  it('warns on 2+ questions', () => {
    const r = validateMessage('¿Cómo estás? ¿Y la chamba?', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V06')).toBe(true);
  });
  it('passes single question', () => {
    const r = validateMessage('¿Cómo va la chamba?', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V06')).toBeUndefined();
  });
  it('passes question with "X o Y" disjunctive', () => {
    const r = validateMessage('¿Prefieres entrenar en casa o en gym?', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V06')).toBeUndefined();
  });
});

describe('validator V07 link too early', () => {
  it('warns on URL in phase < 4', () => {
    const r = validateMessage('Mira https://drive.google.com/...', { ...baseCtx, currentPhase: 2 });
    expect(r.violations.some((v) => v.ruleId === 'V07')).toBe(true);
  });
  it('allows URL in phase ≥ 4', () => {
    const r = validateMessage('Te dejo el enlace https://cal.com/x', { ...baseCtx, currentPhase: 6 });
    expect(r.violations.find((v) => v.ruleId === 'V07')).toBeUndefined();
  });
});

describe('validator V08 excess punctuation', () => {
  it('warns on !!', () => {
    const r = validateMessage('Brutal!! Sigue así', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V08')).toBe(true);
  });
  it('warns on ....', () => {
    const r = validateMessage('Hmm....bueno', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V08')).toBe(true);
  });
  it('passes single punctuation', () => {
    const r = validateMessage('Brutal! Sigue así.', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V08')).toBeUndefined();
  });
});

describe('validator V11 price leak', () => {
  it('errors on price mention before phase 6', () => {
    const r = validateMessage('Cuesta 297€ al mes', { ...baseCtx, currentPhase: 3 });
    expect(r.violations.find((v) => v.ruleId === 'V11')?.severity).toBe('error');
  });
  it('allows price mention in phase 6+', () => {
    const r = validateMessage('Cuesta 297€', { ...baseCtx, currentPhase: 6 });
    expect(r.violations.find((v) => v.ruleId === 'V11')).toBeUndefined();
  });
  it('does not false-positive on numbers in years/percentages', () => {
    const r = validateMessage('Tengo 35 años y poco tiempo', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V11')).toBeUndefined();
  });
});

describe('validator V12 excess apology', () => {
  it('warns on 2+ apologies', () => {
    const r = validateMessage('Perdona, lo siento, disculpa', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V12')).toBe(true);
  });
  it('passes single apology', () => {
    const r = validateMessage('Perdona, ¿qué decías?', baseCtx);
    expect(r.violations.find((v) => v.ruleId === 'V12')).toBeUndefined();
  });
});

describe('validator V15 phase ghost', () => {
  it('errors on phase 0', () => {
    const r = validateMessage('hola', { ...baseCtx, currentPhase: 0 });
    expect(r.violations.find((v) => v.ruleId === 'V15')?.severity).toBe('error');
  });
  it('errors on phase 8', () => {
    const r = validateMessage('hola', { ...baseCtx, currentPhase: 8 });
    expect(r.violations.find((v) => v.ruleId === 'V15')?.severity).toBe('error');
  });
});

describe('validator V16 memory contamination', () => {
  it('warns on "seguimos hablando otro día"', () => {
    const r = validateMessage('Vale, seguimos hablando otro día entonces', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V16')).toBe(true);
  });
  it('warns on "te respondo cuando pueda"', () => {
    const r = validateMessage('No te preocupes, te respondo cuando pueda', baseCtx);
    expect(r.violations.some((v) => v.ruleId === 'V16')).toBe(true);
  });
});

describe('validator runner', () => {
  it('returns ok when no violations', () => {
    const r = validateMessage('¿Cómo va la chamba? 💪', baseCtx);
    expect(r.ok).toBe(true);
    expect(r.hasErrors).toBe(false);
    expect(r.violations).toHaveLength(0);
  });

  it('respects only/skip filters', () => {
    const text = 'Hola otra vez, soy Claude';
    const all = validateMessage(text, baseCtx);
    const onlyV04 = validateMessage(text, baseCtx, { only: ['V04'] });
    const skipV04 = validateMessage(text, baseCtx, { skip: ['V04'] });
    expect(all.violations.length).toBeGreaterThanOrEqual(onlyV04.violations.length);
    expect(onlyV04.violations.every((v) => v.ruleId === 'V04')).toBe(true);
    expect(skipV04.violations.every((v) => v.ruleId !== 'V04')).toBe(true);
  });

  it('does not throw if a rule throws — logs warning and continues', () => {
    const brokenRule = {
      id: 'BROKEN',
      description: 'always throws',
      check: () => {
        throw new Error('boom');
      },
    };
    const r = validateMessage('hola', baseCtx, { rules: [brokenRule] });
    expect(r.violations).toHaveLength(0);
    expect(r.ok).toBe(true);
  });
});
