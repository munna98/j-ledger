'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

/**
 * Checks if a DOM element is currently rendered and visible.
 */
function isElementVisible(el: HTMLElement): boolean {
  if (el.offsetParent !== null) return true;
  const rects = el.getClientRects();
  return rects.length > 0;
}

/**
 * Safely focuses an element and selects its text content if it is a text-compatible input.
 */
function focusAndSelect(el: HTMLElement) {
  el.focus();
  const isInput =
    typeof HTMLInputElement !== 'undefined'
      ? el instanceof HTMLInputElement
      : el.tagName === 'INPUT';
  if (
    isInput &&
    ['text', 'number', 'tel', 'email', 'search', 'url', 'password'].includes(
      ((el as HTMLInputElement).type || '').toLowerCase()
    )
  ) {
    try {
      (el as HTMLInputElement).select?.();
    } catch {
      // Ignore if browser / element does not support selection
    }
  }
}

/**
 * Returns all navigable interactive elements inside a dialog in DOM order.
 * Includes text/date/number inputs, selects, textareas, active radio/toggle buttons with [data-nav-input="true"],
 * and the primary submit button.
 */
export function getDialogNavigableElements(container: HTMLElement): HTMLElement[] {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"]), select, textarea, button[data-nav-input="true"], [data-nav-input="true"], button[type="submit"], [data-nav-submit="true"]'
    )
  );

  return candidates.filter((el) => {
    // Skip hidden or invisible elements
    if (!isElementVisible(el)) return false;

    // Skip disabled elements
    if ((el as HTMLInputElement | HTMLButtonElement | HTMLSelectElement).disabled) {
      return false;
    }

    // Skip read-only inputs/textareas
    if ('readOnly' in el && (el as HTMLInputElement).readOnly) {
      return false;
    }

    const tagName = el.tagName.toUpperCase();

    // Skip non-navigable input types (submit, reset, button, hidden)
    if (tagName === 'INPUT') {
      const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
      if (['hidden', 'submit', 'reset', 'button', 'image'].includes(type)) {
        return false;
      }
    }

    // Skip secondary non-navigable buttons (e.g. cancel, close, secondary action buttons)
    if (tagName === 'BUTTON') {
      const isSubmit =
        (el as HTMLButtonElement).type === 'submit' ||
        el.getAttribute('data-nav-submit') === 'true';
      const isNavInput = el.getAttribute('data-nav-input') === 'true';
      if (!isSubmit && !isNavInput) {
        return false;
      }
    }

    return true;
  });
}

/**
 * KeyDown event handler implementing Enter key navigation across form dialogs:
 * - Enter: moves to next navigable input or primary submit button.
 * - Shift + Enter: moves to previous navigable input.
 * - Ctrl + Enter / Cmd + Enter: immediately submits the dialog's form.
 * - ArrowLeft / ArrowRight: switches between toggle/radio buttons.
 */
export function handleDialogKeyDown(
  e: React.KeyboardEvent<HTMLElement> | KeyboardEvent,
  container: HTMLElement,
  options: { enterNavigation?: boolean } = {}
) {
  if (options.enterNavigation === false) return;
  if (e.defaultPrevented) return;

  const target = e.target as HTMLElement | null;
  if (!target) return;

  // 1. Support Ctrl+Enter / Cmd+Enter to quick-submit from anywhere in the dialog
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    const form = target.closest('form');
    if (form) {
      const submitBtn = form.querySelector<HTMLButtonElement>('button[type="submit"]');
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      } else if (typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else {
        form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    } else {
      const submitBtn = container.querySelector<HTMLButtonElement>(
        'button[type="submit"], [data-nav-submit="true"]'
      );
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.click();
      }
    }
    return;
  }

  // 2. Arrow keys navigation for toggle buttons and radio groups
  if (
    (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
    target.tagName === 'BUTTON'
  ) {
    const role = target.getAttribute('role');
    const parentGroup = target.closest('[role="radiogroup"]');
    if (parentGroup || role === 'radio' || target.getAttribute('data-nav-input') === 'true') {
      const groupButtons = Array.from(
        (parentGroup || target.parentElement || container).querySelectorAll<HTMLButtonElement>(
          'button'
        )
      ).filter(isElementVisible);
      const currentIndex = groupButtons.indexOf(target as HTMLButtonElement);
      if (currentIndex !== -1 && groupButtons.length > 1) {
        e.preventDefault();
        const nextIndex =
          e.key === 'ArrowRight'
            ? (currentIndex + 1) % groupButtons.length
            : (currentIndex - 1 + groupButtons.length) % groupButtons.length;
        const nextBtn = groupButtons[nextIndex];
        if (nextBtn) {
          nextBtn.focus();
          nextBtn.click();
        }
        return;
      }
    }
  }

  // 3. Enter key input navigation
  if (e.key === 'Enter') {
    // Preserve normal Enter key in multiline textareas
    if (target.tagName === 'TEXTAREA') {
      return;
    }

    const isSubmitButton =
      target.tagName === 'BUTTON' &&
      ((target as HTMLButtonElement).type === 'submit' ||
        target.getAttribute('data-nav-submit') === 'true');

    // If focused on the submit button without Shift, let normal button submit happen
    if (isSubmitButton && !e.shiftKey) {
      return;
    }

    // If focused on an unrelated non-nav button (e.g. Cancel button, Add Slab button, Close button):
    // Let normal button click happen
    if (
      target.tagName === 'BUTTON' &&
      !isSubmitButton &&
      target.getAttribute('data-nav-input') !== 'true'
    ) {
      return;
    }

    const navigables = getDialogNavigableElements(container);
    const currentIndex = navigables.indexOf(target);

    // If target is not in the list (e.g. clicked on dialog background), focus the first input
    if (currentIndex === -1) {
      if (navigables.length > 0) {
        e.preventDefault();
        focusAndSelect(navigables[0]);
      }
      return;
    }

    e.preventDefault();

    if (e.shiftKey) {
      // Shift + Enter: move to previous navigable element
      if (currentIndex > 0) {
        const prevEl = navigables[currentIndex - 1];
        focusAndSelect(prevEl);
      }
    } else {
      // Plain Enter: move to next navigable element or submit button
      if (currentIndex < navigables.length - 1) {
        const nextEl = navigables[currentIndex + 1];
        focusAndSelect(nextEl);
      } else {
        // Last element in navigables: if inside form, click submit button
        const form = target.closest('form');
        const submitBtn =
          form?.querySelector<HTMLButtonElement>('button[type="submit"]') ||
          container.querySelector<HTMLButtonElement>('[data-nav-submit="true"]');
        if (submitBtn && !submitBtn.disabled) {
          submitBtn.click();
        }
      }
    }
  }
}

export function DialogContent({
  className,
  children,
  title,
  description,
  maxWidth = 'max-w-lg',
  enterNavigation = true,
}: {
  className?: string;
  children: React.ReactNode;
  title?: string;
  description?: string;
  maxWidth?: string;
  enterNavigation?: boolean;
}) {
  const contentRef = React.useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const container = contentRef.current;
    if (container) {
      handleDialogKeyDown(e, container, { enterNavigation });
    }
  };

  const onOpenAutoFocus = (e: Event) => {
    const container = contentRef.current;
    if (!container || !enterNavigation) return;

    // If an element explicitly requested autofocus, respect it
    const explicitAutoFocus = container.querySelector<HTMLElement>('[autofocus], [data-autofocus]');
    if (explicitAutoFocus) {
      e.preventDefault();
      focusAndSelect(explicitAutoFocus);
      return;
    }

    // Otherwise, autofocus the first navigable input field
    const navigables = getDialogNavigableElements(container);
    const firstInput = navigables.find(
      (el) =>
        !(el.tagName === 'BUTTON' && (el as HTMLButtonElement).type === 'submit') &&
        el.getAttribute('data-nav-submit') !== 'true'
    );
    if (firstInput) {
      e.preventDefault();
      focusAndSelect(firstInput);
    }
  };

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-200" />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
        <DialogPrimitive.Content
          ref={contentRef}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={onOpenAutoFocus}
          className={cn(
            'relative w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 duration-200 focus:outline-hidden my-auto max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3.5rem)] flex flex-col overflow-hidden',
            maxWidth,
            className
          )}
        >
          {title && (
            <div className="shrink-0 px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800/80 pr-12">
              <DialogPrimitive.Title className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
          )}
          <div className={cn('overflow-y-auto flex-1 min-h-0 px-6 py-5', !title && 'pt-6')}>
            {children}
          </div>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-md p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus:outline-hidden z-10">
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </DialogPrimitive.Portal>
  );
}
