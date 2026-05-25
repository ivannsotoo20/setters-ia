import { describe, it, expect } from 'vitest';
import { detectGenderHeuristic } from '../src/lib/detect-gender.js';

describe('detectGenderHeuristic — male', () => {
  it.each([
    'Carlos',
    'Juan',
    'David',
    'Pedro',
    'José',
    'Iván',
    'Pablo',
    'Diego',
    'Manuel',
    'Antonio',
    'Javier',
    'Miguel',
    'Sergio',
    'Andrés',
    'Hugo',
  ])('%s → male', (name) => {
    const r = detectGenderHeuristic(name);
    expect(r.gender).toBe('male');
  });
});

describe('detectGenderHeuristic — female', () => {
  it.each([
    'María',
    'Andrea',
    'Laura',
    'Carmen',
    'Ana',
    'Isabel',
    'Sofía',
    'Lucía',
    'Paula',
    'Sara',
    'Alba',
    'Patricia',
    'Cristina',
    'Marta',
    'Mónica',
  ])('%s → female', (name) => {
    const r = detectGenderHeuristic(name);
    expect(r.gender).toBe('female');
  });
});

describe('detectGenderHeuristic — ambiguous', () => {
  it.each([
    'Yael',
    'Cruz',
    'Sam',
    'Alex',
    'Jordan',
    'Pat',
    'Taylor',
    'Morgan',
    'Casey',
  ])('%s → ambiguous', (name) => {
    const r = detectGenderHeuristic(name);
    expect(r.gender).toBe('ambiguous');
  });
});

describe('detectGenderHeuristic — unknown (no aparece en diccionario)', () => {
  it.each([
    'Xx', // no es nombre real
    'Akiko', // japonés, no en dict
    'Bjørn', // nórdico
    'Olusegun', // africano
    'Zzzz',
  ])('%s → unknown', (name) => {
    const r = detectGenderHeuristic(name);
    expect(r.gender).toBe('unknown');
  });
});

describe('detectGenderHeuristic — variantes de input', () => {
  it('case-insensitive: "CARLOS" → male', () => {
    expect(detectGenderHeuristic('CARLOS').gender).toBe('male');
  });

  it('case-insensitive: "carlos" → male', () => {
    expect(detectGenderHeuristic('carlos').gender).toBe('male');
  });

  it('accents stripped: "María" igual que "Maria"', () => {
    expect(detectGenderHeuristic('María').gender).toBe('female');
    expect(detectGenderHeuristic('Maria').gender).toBe('female');
  });

  it('full name → usa primer token: "María José Pérez" → female (por María)', () => {
    expect(detectGenderHeuristic('María José Pérez').gender).toBe('female');
  });

  it('empty string → unknown', () => {
    expect(detectGenderHeuristic('').gender).toBe('unknown');
  });

  it('whitespace only → unknown', () => {
    expect(detectGenderHeuristic('   ').gender).toBe('unknown');
  });

  it('source siempre heuristic en función sync', () => {
    const r = detectGenderHeuristic('Carlos');
    expect(r.source).toBe('heuristic');
  });
});
