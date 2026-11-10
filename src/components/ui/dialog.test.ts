/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { getDialogNavigableElements, handleDialogKeyDown } from './dialog';

// Helper to create mock DOM elements for unit testing
function createMockElement(config: {
  tagName: string;
  type?: string;
  disabled?: boolean;
  readOnly?: boolean;
  attributes?: Record<string, string>;
  visible?: boolean;
  parent?: any;
}) {
  const attributes = config.attributes || {};
  let isFocused = false;
  let isSelected = false;
  let isClicked = false;

  const el: any = {
    tagName: config.tagName.toUpperCase(),
    type: config.type || (config.tagName.toLowerCase() === 'input' ? 'text' : undefined),
    disabled: config.disabled || false,
    readOnly: config.readOnly || false,
    offsetParent: config.visible === false ? null : {},
    getClientRects: () => (config.visible === false ? [] : [{ width: 100, height: 20 }]),
    getAttribute: (name: string) => attributes[name] || null,
    hasAttribute: (name: string) => name in attributes,
    setAttribute: (name: string, val: string) => {
      attributes[name] = val;
    },
    parentElement: config.parent || null,
    closest: (selector: string) => {
      if (selector === 'form' && config.parent?.tagName === 'FORM') {
        return config.parent;
      }
      return null;
    },
    focus: vi.fn(() => {
      isFocused = true;
    }),
    select: vi.fn(() => {
      isSelected = true;
    }),
    click: vi.fn(() => {
      isClicked = true;
    }),
    get isFocused() {
      return isFocused;
    },
    get isSelected() {
      return isSelected;
    },
    get isClicked() {
      return isClicked;
    },
  };

  return el;
}

describe('Dialog Enter Key Input Navigation', () => {
  it('identifies navigable inputs and filters out hidden, disabled, and readonly inputs', () => {
    const input1 = createMockElement({ tagName: 'INPUT', type: 'text' });
    const inputDisabled = createMockElement({ tagName: 'INPUT', type: 'text', disabled: true });
    const inputReadOnly = createMockElement({ tagName: 'INPUT', type: 'number', readOnly: true });
    const inputHidden = createMockElement({ tagName: 'INPUT', type: 'hidden' });
    const select = createMockElement({ tagName: 'SELECT' });
    const submitBtn = createMockElement({ tagName: 'BUTTON', type: 'submit' });
    const cancelBtn = createMockElement({ tagName: 'BUTTON', type: 'button' });
    const toggleActive = createMockElement({
      tagName: 'BUTTON',
      type: 'button',
      attributes: { 'data-nav-input': 'true' },
    });

    const mockContainer: any = {
      querySelectorAll: () => [
        input1,
        inputDisabled,
        inputReadOnly,
        inputHidden,
        select,
        toggleActive,
        cancelBtn,
        submitBtn,
      ],
    };

    const navigables = getDialogNavigableElements(mockContainer);

    expect(navigables).toContain(input1);
    expect(navigables).not.toContain(inputDisabled);
    expect(navigables).not.toContain(inputReadOnly);
    expect(navigables).not.toContain(inputHidden);
    expect(navigables).toContain(select);
    expect(navigables).toContain(toggleActive);
    expect(navigables).not.toContain(cancelBtn); // secondary cancel button is excluded
    expect(navigables).toContain(submitBtn); // submit button is at the end
  });

  it('navigates from input to next input on Enter key', () => {
    const input1 = createMockElement({ tagName: 'INPUT', type: 'text' });
    const input2 = createMockElement({ tagName: 'INPUT', type: 'number' });
    const submitBtn = createMockElement({ tagName: 'BUTTON', type: 'submit' });

    const container: any = {
      querySelectorAll: () => [input1, input2, submitBtn],
    };

    const preventDefault = vi.fn();
    const event: any = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      target: input1,
      preventDefault,
    };

    handleDialogKeyDown(event, container);

    expect(preventDefault).toHaveBeenCalled();
    expect(input2.focus).toHaveBeenCalled();
    expect(input2.select).toHaveBeenCalled();
  });

  it('navigates to submit button on Enter from the last input', () => {
    const input1 = createMockElement({ tagName: 'INPUT', type: 'text' });
    const input2 = createMockElement({ tagName: 'INPUT', type: 'number' });
    const submitBtn = createMockElement({ tagName: 'BUTTON', type: 'submit' });

    const container: any = {
      querySelectorAll: () => [input1, input2, submitBtn],
    };

    const preventDefault = vi.fn();
    const event: any = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      target: input2,
      preventDefault,
    };

    handleDialogKeyDown(event, container);

    expect(preventDefault).toHaveBeenCalled();
    expect(submitBtn.focus).toHaveBeenCalled();
  });

  it('does NOT prevent default on Enter when focus is on the submit button (allowing native submission)', () => {
    const input1 = createMockElement({ tagName: 'INPUT', type: 'text' });
    const submitBtn = createMockElement({ tagName: 'BUTTON', type: 'submit' });

    const container: any = {
      querySelectorAll: () => [input1, submitBtn],
    };

    const preventDefault = vi.fn();
    const event: any = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      target: submitBtn,
      preventDefault,
    };

    handleDialogKeyDown(event, container);

    // Enter on submit button must not be prevented, so form submits
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('moves backward on Shift+Enter', () => {
    const input1 = createMockElement({ tagName: 'INPUT', type: 'text' });
    const input2 = createMockElement({ tagName: 'INPUT', type: 'number' });
    const submitBtn = createMockElement({ tagName: 'BUTTON', type: 'submit' });

    const container: any = {
      querySelectorAll: () => [input1, input2, submitBtn],
    };

    const preventDefault = vi.fn();
    const event: any = {
      key: 'Enter',
      shiftKey: true,
      ctrlKey: false,
      metaKey: false,
      target: input2,
      preventDefault,
    };

    handleDialogKeyDown(event, container);

    expect(preventDefault).toHaveBeenCalled();
    expect(input1.focus).toHaveBeenCalled();
    expect(input1.select).toHaveBeenCalled();
  });

  it('submits immediately on Ctrl+Enter from any field', () => {
    const submitBtn = createMockElement({ tagName: 'BUTTON', type: 'submit' });
    const mockForm: any = {
      tagName: 'FORM',
      querySelector: (sel: string) => (sel.includes('type="submit"') ? submitBtn : null),
    };

    const input1 = createMockElement({ tagName: 'INPUT', type: 'text', parent: mockForm });

    const container: any = {
      querySelectorAll: () => [input1, submitBtn],
    };

    const preventDefault = vi.fn();
    const event: any = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      target: input1,
      preventDefault,
    };

    handleDialogKeyDown(event, container);

    expect(preventDefault).toHaveBeenCalled();
    expect(submitBtn.click).toHaveBeenCalled();
  });

  it('does not hijack plain Enter inside textarea', () => {
    const textarea = createMockElement({ tagName: 'TEXTAREA' });
    const submitBtn = createMockElement({ tagName: 'BUTTON', type: 'submit' });

    const container: any = {
      querySelectorAll: () => [textarea, submitBtn],
    };

    const preventDefault = vi.fn();
    const event: any = {
      key: 'Enter',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      target: textarea,
      preventDefault,
    };

    handleDialogKeyDown(event, container);

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('switches radio / toggle buttons with Arrow keys', () => {
    const bankBtn = createMockElement({
      tagName: 'BUTTON',
      type: 'button',
      attributes: { role: 'radio', 'data-nav-input': 'true' },
    });
    const cashBtn = createMockElement({
      tagName: 'BUTTON',
      type: 'button',
      attributes: { role: 'radio' },
    });

    const radioGroup: any = {
      tagName: 'DIV',
      getAttribute: (name: string) => (name === 'role' ? 'radiogroup' : null),
      querySelectorAll: () => [bankBtn, cashBtn],
    };

    bankBtn.closest = (sel: string) => (sel === '[role="radiogroup"]' ? radioGroup : null);

    const container: any = {
      querySelectorAll: () => [bankBtn, cashBtn],
    };

    const preventDefault = vi.fn();
    const event: any = {
      key: 'ArrowRight',
      shiftKey: false,
      ctrlKey: false,
      metaKey: false,
      target: bankBtn,
      preventDefault,
    };

    handleDialogKeyDown(event, container);

    expect(preventDefault).toHaveBeenCalled();
    expect(cashBtn.focus).toHaveBeenCalled();
    expect(cashBtn.click).toHaveBeenCalled();
  });
});
