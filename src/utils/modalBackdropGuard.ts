import type React from 'react';

interface BackdropPressState {
  armed: boolean;
  fromPointer: boolean;
}

export interface BackdropDismissOptions {
  /**
   * When true (default), a backdrop press that starts while a form field or
   * contenteditable element inside the modal is focused only blurs/commits that
   * field instead of immediately closing the modal.
   */
  guardFocusedInputs?: boolean;
  /**
   * When true (default), stops bubble-phase propagation of pointerdown,
   * mousedown, and click on the backdrop so canvas drag/click handlers beneath
   * the overlay are never triggered.
   */
  stopPropagation?: boolean;
}

export interface BackdropDismissHandlers<T extends Element = HTMLDivElement> {
  onPointerDownCapture: (e: React.PointerEvent<T>) => void;
  onPointerUpCapture: (e: React.PointerEvent<T>) => void;
  onPointerCancelCapture: (e: React.PointerEvent<T>) => void;
  onMouseDownCapture: (e: React.MouseEvent<T>) => void;
  onMouseUpCapture: (e: React.MouseEvent<T>) => void;
  onPointerDown: (e: React.PointerEvent<T>) => void;
  onMouseDown: (e: React.MouseEvent<T>) => void;
  onClick: (e: React.MouseEvent<T>) => void;
}

const backdropPressStates = new WeakMap<EventTarget, BackdropPressState>();

/**
 * Returns true when `el` is an editable form control or contenteditable region.
 */
export function isEditableElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tagName = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
    return true;
  }
  if ((el as HTMLElement).isContentEditable === true) {
    return true;
  }
  if (typeof el.getAttribute === 'function') {
    const attr = el.getAttribute('contenteditable');
    if (attr !== null) {
      const normalized = attr.toLowerCase();
      if (normalized === '' || normalized === 'true') {
        return true;
      }
    }
  }
  return false;
}

/**
 * Determines whether a press starting on the backdrop should arm click-to-dismiss.
 */
export function shouldArmBackdropDismiss(params: {
  isDirectBackdropTarget: boolean;
  backdropElement?: Element | null;
  activeElement?: Element | null;
  guardFocusedInputs?: boolean;
}): boolean {
  if (!params.isDirectBackdropTarget) {
    return false;
  }
  if (params.guardFocusedInputs !== false && isEditableElement(params.activeElement)) {
    const isInsideBackdrop =
      params.backdropElement && typeof params.backdropElement.contains === 'function'
        ? params.backdropElement.contains(params.activeElement ?? null)
        : true;
    if (isInsideBackdrop) {
      return false;
    }
  }
  return true;
}

function getDocumentActiveElement(target: Element): Element | null {
  const doc = target.ownerDocument ?? (typeof document !== 'undefined' ? document : null);
  return doc?.activeElement ?? null;
}

/**
 * Builds capture + bubble handlers for modal/drawer backdrops so that:
 * 1. Dragging a text selection from inside the modal out onto the backdrop
 *    never closes the modal when the pointer is released.
 * 2. Dragging from the backdrop into the modal never closes the modal.
 * 3. Clicking the backdrop while an editable input inside the modal is focused
 *    lets the field blur/commit safely without discarding user edits.
 */
export function createBackdropDismissHandlers<T extends Element = HTMLDivElement>(
  onDismiss: (() => void) | undefined,
  options?: BackdropDismissOptions
): BackdropDismissHandlers<T> {
  const stopProp = options?.stopPropagation !== false;
  const guardFocusedInputs = options?.guardFocusedInputs;

  return {
    onPointerDownCapture: (e) => {
      const armed = shouldArmBackdropDismiss({
        isDirectBackdropTarget: e.target === e.currentTarget,
        backdropElement: e.currentTarget,
        activeElement: getDocumentActiveElement(e.currentTarget),
        guardFocusedInputs,
      });
      backdropPressStates.set(e.currentTarget, { armed, fromPointer: true });
    },
    onPointerUpCapture: (e) => {
      if (e.target !== e.currentTarget) {
        const prev = backdropPressStates.get(e.currentTarget);
        if (prev) {
          backdropPressStates.set(e.currentTarget, {
            armed: false,
            fromPointer: prev.fromPointer,
          });
        }
      }
    },
    onPointerCancelCapture: (e) => {
      backdropPressStates.set(e.currentTarget, { armed: false, fromPointer: false });
    },
    onMouseDownCapture: (e) => {
      const canArm = shouldArmBackdropDismiss({
        isDirectBackdropTarget: e.target === e.currentTarget,
        backdropElement: e.currentTarget,
        activeElement: getDocumentActiveElement(e.currentTarget),
        guardFocusedInputs,
      });
      const prev = backdropPressStates.get(e.currentTarget);
      const armed = prev?.fromPointer ? Boolean(prev.armed && canArm) : canArm;
      backdropPressStates.set(e.currentTarget, { armed, fromPointer: false });
    },
    onMouseUpCapture: (e) => {
      if (e.target !== e.currentTarget) {
        backdropPressStates.set(e.currentTarget, { armed: false, fromPointer: false });
      }
    },
    onPointerDown: (e) => {
      if (stopProp) {
        e.stopPropagation();
      }
    },
    onMouseDown: (e) => {
      if (stopProp) {
        e.stopPropagation();
      }
    },
    onClick: (e) => {
      if (stopProp) {
        e.stopPropagation();
      }
      const prev = backdropPressStates.get(e.currentTarget);
      backdropPressStates.set(e.currentTarget, { armed: false, fromPointer: false });
      if (prev?.armed && e.target === e.currentTarget && onDismiss) {
        onDismiss();
      }
    },
  };
}
