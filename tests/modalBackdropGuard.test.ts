import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import type React from 'react';
import {
  createBackdropDismissHandlers,
  isEditableElement,
  shouldArmBackdropDismiss,
} from '../src/utils/modalBackdropGuard';

interface MockElement {
  tagName: string;
  isContentEditable?: boolean;
  attributes?: Record<string, string>;
  children: MockElement[];
  ownerDocument?: { activeElement: Element | null };
  getAttribute: (name: string) => string | null;
  contains: (other: Node | null) => boolean;
}

function createMockElement(
  tagName: string,
  options?: {
    isContentEditable?: boolean;
    attributes?: Record<string, string>;
    children?: MockElement[];
    ownerDocument?: { activeElement: Element | null };
  }
): MockElement & Element {
  const node: MockElement = {
    tagName,
    isContentEditable: options?.isContentEditable,
    attributes: options?.attributes ?? {},
    children: options?.children ?? [],
    ownerDocument: options?.ownerDocument,
    getAttribute: (name: string) => node.attributes?.[name] ?? null,
    contains: (other: Node | null): boolean => {
      if (!other) return false;
      if ((other as unknown as MockElement) === node) return true;
      return node.children.some((child) => child.contains(other));
    },
  };
  return node as unknown as MockElement & Element;
}

function makePointerEvent(
  target: Element,
  currentTarget: HTMLDivElement,
  stopCalls?: string[],
  typeName = 'pointer'
): React.PointerEvent<HTMLDivElement> {
  return {
    target,
    currentTarget,
    stopPropagation: () => {
      stopCalls?.push(typeName);
    },
  } as unknown as React.PointerEvent<HTMLDivElement>;
}

function makeMouseEvent(
  target: Element,
  currentTarget: HTMLDivElement,
  stopCalls?: string[],
  typeName = 'mouse'
): React.MouseEvent<HTMLDivElement> {
  return {
    target,
    currentTarget,
    stopPropagation: () => {
      stopCalls?.push(typeName);
    },
  } as unknown as React.MouseEvent<HTMLDivElement>;
}

function collectTsxFiles(dirPath: string): string[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTsxFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      files.push(fullPath);
    }
  }
  return files;
}

/**
 * Extracts every JSX opening tag (`<div ...>`) that contains `fixed inset-0`
 * inside its attributes, tracking braces and quotes accurately across multiline TSX.
 */
function findFixedInsetDivOpeningTags(source: string): string[] {
  const matches: string[] = [];
  let cursor = 0;

  while (cursor < source.length) {
    const divStart = source.indexOf('<div', cursor);
    if (divStart === -1) break;

    const nextChar = source[divStart + 4];
    if (nextChar && !/[\s>]/.test(nextChar)) {
      cursor = divStart + 4;
      continue;
    }

    let i = divStart + 4;
    let braceDepth = 0;
    let quote: '"' | "'" | '`' | null = null;
    let escaped = false;
    let tagEnd = -1;

    while (i < source.length) {
      const ch = source[i];
      if (escaped) {
        escaped = false;
        i += 1;
        continue;
      }
      if (quote) {
        if (ch === '\\' && quote !== "'") {
          escaped = true;
        } else if (ch === quote) {
          quote = null;
        }
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        quote = ch;
        i += 1;
        continue;
      }
      if (ch === '{') {
        braceDepth += 1;
      } else if (ch === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
      } else if (ch === '>' && braceDepth === 0) {
        tagEnd = i;
        break;
      }
      i += 1;
    }

    if (tagEnd === -1) break;
    const tagText = source.slice(divStart, tagEnd + 1);
    if (tagText.includes('fixed inset-0')) {
      matches.push(tagText);
    }
    cursor = divStart + 4;
  }

  return matches;
}

describe('modalBackdropGuard', () => {
  it('detects editable form and contenteditable elements accurately', () => {
    assert.equal(isEditableElement(createMockElement('INPUT')), true);
    assert.equal(isEditableElement(createMockElement('textarea')), true);
    assert.equal(isEditableElement(createMockElement('SELECT')), true);
    assert.equal(isEditableElement(createMockElement('DIV', { isContentEditable: true })), true);
    assert.equal(
      isEditableElement(createMockElement('DIV', { attributes: { contenteditable: 'true' } })),
      true
    );
    assert.equal(
      isEditableElement(createMockElement('DIV', { attributes: { contenteditable: '' } })),
      true
    );

    assert.equal(isEditableElement(createMockElement('DIV')), false);
    assert.equal(isEditableElement(createMockElement('BUTTON')), false);
    assert.equal(
      isEditableElement(createMockElement('DIV', { attributes: { contenteditable: 'false' } })),
      false
    );
    assert.equal(isEditableElement(null), false);
    assert.equal(isEditableElement(undefined), false);
  });

  it('arms only for direct backdrop targets when no interior input is focused', () => {
    const doc = { activeElement: null as Element | null };
    const innerInput = createMockElement('INPUT', { ownerDocument: doc });
    const unrelatedInput = createMockElement('INPUT', { ownerDocument: doc });
    const backdrop = createMockElement('DIV', {
      ownerDocument: doc,
      children: [innerInput],
    });
    const body = createMockElement('BODY', { ownerDocument: doc });

    doc.activeElement = body;
    assert.equal(
      shouldArmBackdropDismiss({
        isDirectBackdropTarget: false,
        backdropElement: backdrop,
        activeElement: doc.activeElement,
      }),
      false
    );
    assert.equal(
      shouldArmBackdropDismiss({
        isDirectBackdropTarget: true,
        backdropElement: backdrop,
        activeElement: doc.activeElement,
      }),
      true
    );

    doc.activeElement = innerInput;
    assert.equal(
      shouldArmBackdropDismiss({
        isDirectBackdropTarget: true,
        backdropElement: backdrop,
        activeElement: doc.activeElement,
      }),
      false
    );
    assert.equal(
      shouldArmBackdropDismiss({
        isDirectBackdropTarget: true,
        backdropElement: backdrop,
        activeElement: doc.activeElement,
        guardFocusedInputs: false,
      }),
      true
    );

    doc.activeElement = unrelatedInput;
    assert.equal(
      shouldArmBackdropDismiss({
        isDirectBackdropTarget: true,
        backdropElement: backdrop,
        activeElement: doc.activeElement,
      }),
      true
    );
  });

  it('ignores text-highlight drags starting inside an input/card and ending on the backdrop', () => {
    let dismissCount = 0;
    const doc = { activeElement: null as Element | null };
    const input = createMockElement('INPUT', { ownerDocument: doc });
    const modalCard = createMockElement('DIV', { ownerDocument: doc, children: [input] });
    const backdrop = createMockElement('DIV', {
      ownerDocument: doc,
      children: [modalCard],
    }) as unknown as HTMLDivElement;
    doc.activeElement = input;

    const handlers = createBackdropDismissHandlers(() => {
      dismissCount += 1;
    });

    // User presses down inside the input, highlights text out past the modal card,
    // and releases the mouse button on the backdrop; the browser then fires click on
    // the lowest common ancestor (the backdrop itself).
    handlers.onPointerDownCapture(makePointerEvent(input, backdrop));
    handlers.onMouseDownCapture(makeMouseEvent(input, backdrop));
    handlers.onPointerUpCapture(makePointerEvent(backdrop, backdrop));
    handlers.onMouseUpCapture(makeMouseEvent(backdrop, backdrop));
    handlers.onClick(makeMouseEvent(backdrop, backdrop));

    assert.equal(dismissCount, 0);
  });

  it('ignores drag-in gestures starting on the backdrop and ending inside the modal', () => {
    let dismissCount = 0;
    const doc = { activeElement: null as Element | null };
    const modalCard = createMockElement('DIV', { ownerDocument: doc });
    const backdrop = createMockElement('DIV', {
      ownerDocument: doc,
      children: [modalCard],
    }) as unknown as HTMLDivElement;
    const body = createMockElement('BODY', { ownerDocument: doc });
    doc.activeElement = body;

    const handlers = createBackdropDismissHandlers(() => {
      dismissCount += 1;
    });

    handlers.onPointerDownCapture(makePointerEvent(backdrop, backdrop));
    handlers.onMouseDownCapture(makeMouseEvent(backdrop, backdrop));
    handlers.onPointerUpCapture(makePointerEvent(modalCard, backdrop));
    handlers.onMouseUpCapture(makeMouseEvent(modalCard, backdrop));
    handlers.onClick(makeMouseEvent(backdrop, backdrop));

    assert.equal(dismissCount, 0);
  });

  it('prevents dismissal on first click while an input inside the modal is focused, then allows a clean click', () => {
    let dismissCount = 0;
    const doc = { activeElement: null as Element | null };
    const textarea = createMockElement('TEXTAREA', { ownerDocument: doc });
    const body = createMockElement('BODY', { ownerDocument: doc });
    const backdrop = createMockElement('DIV', {
      ownerDocument: doc,
      children: [textarea],
    }) as unknown as HTMLDivElement;

    const handlers = createBackdropDismissHandlers(() => {
      dismissCount += 1;
    });

    // First click while editing textarea inside the modal blurs/commits without closing.
    doc.activeElement = textarea;
    handlers.onPointerDownCapture(makePointerEvent(backdrop, backdrop));
    handlers.onMouseDownCapture(makeMouseEvent(backdrop, backdrop));
    doc.activeElement = body;
    handlers.onPointerUpCapture(makePointerEvent(backdrop, backdrop));
    handlers.onMouseUpCapture(makeMouseEvent(backdrop, backdrop));
    handlers.onClick(makeMouseEvent(backdrop, backdrop));
    assert.equal(dismissCount, 0);

    // Second deliberate click directly on backdrop dismisses cleanly.
    handlers.onPointerDownCapture(makePointerEvent(backdrop, backdrop));
    handlers.onMouseDownCapture(makeMouseEvent(backdrop, backdrop));
    handlers.onPointerUpCapture(makePointerEvent(backdrop, backdrop));
    handlers.onMouseUpCapture(makeMouseEvent(backdrop, backdrop));
    handlers.onClick(makeMouseEvent(backdrop, backdrop));
    assert.equal(dismissCount, 1);
  });

  it('recovers cleanly after an aborted out-of-window drag and stops propagation only in bubble phase', () => {
    let dismissCount = 0;
    const stopCalls: string[] = [];
    const doc = { activeElement: null as Element | null };
    const modalCard = createMockElement('DIV', { ownerDocument: doc });
    const backdrop = createMockElement('DIV', {
      ownerDocument: doc,
      children: [modalCard],
    }) as unknown as HTMLDivElement;
    const body = createMockElement('BODY', { ownerDocument: doc });
    doc.activeElement = body;

    const handlers = createBackdropDismissHandlers(() => {
      dismissCount += 1;
    });

    // Gesture 1: pressed inside modal card, released outside browser window (no click event).
    handlers.onPointerDownCapture(makePointerEvent(modalCard, backdrop, stopCalls, 'pdown-cap'));
    handlers.onMouseDownCapture(makeMouseEvent(modalCard, backdrop, stopCalls, 'mdown-cap'));
    assert.deepEqual(stopCalls, []);

    // Gesture 2: clean backdrop click works immediately and bubble handlers stop propagation.
    handlers.onPointerDownCapture(makePointerEvent(backdrop, backdrop, stopCalls, 'pdown-cap'));
    handlers.onPointerDown(makePointerEvent(backdrop, backdrop, stopCalls, 'pdown-bubble'));
    handlers.onMouseDownCapture(makeMouseEvent(backdrop, backdrop, stopCalls, 'mdown-cap'));
    handlers.onMouseDown(makeMouseEvent(backdrop, backdrop, stopCalls, 'mdown-bubble'));
    handlers.onPointerUpCapture(makePointerEvent(backdrop, backdrop, stopCalls, 'pup-cap'));
    handlers.onMouseUpCapture(makeMouseEvent(backdrop, backdrop, stopCalls, 'mup-cap'));
    handlers.onClick(makeMouseEvent(backdrop, backdrop, stopCalls, 'click-bubble'));

    assert.equal(dismissCount, 1);
    assert.deepEqual(stopCalls, ['pdown-bubble', 'mdown-bubble', 'click-bubble']);
  });

  it('guards every dismissible fixed inset-0 overlay across src/components/', () => {
    const componentsDir = path.resolve(process.cwd(), 'src/components');
    const tsxFiles = collectTsxFiles(componentsDir);
    assert.ok(tsxFiles.length > 0, 'Expected component TSX files under src/components');

    const exemptedBackdropClickFiles = new Set([
      path.normalize('src/components/kiosk/NightMode.tsx'),
      path.normalize('src/components/layout/Corkboard.tsx'),
    ]);

    const guardedComponents: string[] = [];

    for (const filePath of tsxFiles) {
      const relPath = path.normalize(path.relative(process.cwd(), filePath));
      const content = fs.readFileSync(filePath, 'utf8');

      assert.equal(
        content.includes('__backdropMouseDown'),
        false,
        `${relPath} should use createBackdropDismissHandlers instead of __backdropMouseDown`
      );
      assert.equal(
        content.includes('backdropMouseDownRef'),
        false,
        `${relPath} should use createBackdropDismissHandlers instead of backdropMouseDownRef`
      );
      assert.equal(
        content.includes('backdropPointerDownRef'),
        false,
        `${relPath} should use createBackdropDismissHandlers instead of backdropPointerDownRef`
      );

      if (content.includes('createBackdropDismissHandlers')) {
        guardedComponents.push(relPath);
      }

      if (exemptedBackdropClickFiles.has(relPath)) {
        continue;
      }

      const backdropTags = findFixedInsetDivOpeningTags(content);
      for (const tag of backdropTags) {
        assert.equal(
          /\bonClick\s*=/.test(tag),
          false,
          `${relPath} has an unguarded onClick on a fixed inset-0 overlay:\n${tag}`
        );
      }
    }

    assert.ok(
      guardedComponents.length >= 25,
      `Expected at least 25 components using createBackdropDismissHandlers, found ${guardedComponents.length}`
    );

    const mealEntrySource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/meals/MealEntryModal.tsx'),
      'utf8'
    );
    assert.equal(mealEntrySource.includes('createBackdropDismissHandlers(onClose)'), true);

    const textBoxSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/widgets/TextBoxWidget.tsx'),
      'utf8'
    );
    assert.equal(textBoxSource.includes('preserveInlineEditorFocus'), true);
    assert.equal(textBoxSource.includes('select-text'), true);

    const readerSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/common/InAppWebViewerModal.tsx'),
      'utf8'
    );
    assert.equal(readerSource.includes('createBackdropDismissHandlers(onClose)'), true);
    assert.equal(readerSource.includes('user-select: text;'), true);
  });
});
