/**
 * A small right-click menu for the Navigator (SwissCirkus fork), drawn in the
 * app's own context-menu look (.script-context-menu / .ctx-item). It opens
 * at the pointer, stays inside the window, and closes on a click elsewhere,
 * Escape, scrolling or the window losing focus. Arrow keys move between
 * items; Enter picks one.
 */
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export type NavMenuItem =
  | { kind?: 'item'; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; checked?: boolean }
  | { kind: 'separator' }
  | { kind: 'colors'; label: string; colors: string[]; current: string; noColorLabel: string; onPick: (color: string) => void };

export interface NavMenuState { x: number; y: number; items: NavMenuItem[] }

const NavContextMenu: React.FC<{ menu: NavMenuState; onClose: () => void }> = ({ menu, onClose }) => {
  const ref = useRef<HTMLDivElement>(null);

  // Keep the whole menu on screen: flip left / up when it would run off.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = menu.x + r.width > window.innerWidth - 8 ? Math.max(8, menu.x - r.width) : menu.x;
    const top = menu.y + r.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - 8 - r.height) : menu.y;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [menu]);

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    const away = () => onClose();
    document.addEventListener('mousedown', down, true);
    document.addEventListener('keydown', key, true);
    window.addEventListener('blur', away);
    window.addEventListener('resize', away);
    document.addEventListener('scroll', away, true);
    return () => {
      document.removeEventListener('mousedown', down, true);
      document.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', away);
      window.removeEventListener('resize', away);
      document.removeEventListener('scroll', away, true);
    };
  }, [onClose]);

  const move = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
    const i = items.indexOf(document.activeElement as HTMLElement);
    const next = items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
    next?.focus();
  };

  const pick = (fn: () => void) => { onClose(); fn(); };

  return createPortal(
    <div ref={ref} className="script-context-menu nav-context-menu" role="menu" style={{ left: menu.x, top: menu.y }} onKeyDown={move} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((item, i) => {
        if (item.kind === 'separator') return <div key={i} className="ctx-separator" role="separator" />;
        if (item.kind === 'colors') {
          return (
            <div key={i} className="nav-ctx-colors" role="group" aria-label={item.label}>
              <span className="nav-ctx-colors-label">{item.label}</span>
              <div className="nav-ctx-swatches">
                {item.colors.map((c) => (
                  <button
                    key={c || 'none'}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    className={`nav-ctx-swatch${item.current === c ? ' selected' : ''}${c ? '' : ' none'}`}
                    style={c ? { background: c } : undefined}
                    title={c || item.noColorLabel}
                    aria-label={c || item.noColorLabel}
                    onClick={() => pick(() => item.onPick(c))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); pick(() => item.onPick(c)); } }}
                  />
                ))}
              </div>
            </div>
          );
        }
        return (
          <div
            key={i}
            role="menuitem"
            tabIndex={-1}
            aria-disabled={item.disabled || undefined}
            className={`ctx-item${item.disabled ? ' ctx-disabled' : ''}${item.danger ? ' nav-ctx-danger' : ''}${item.checked ? ' ctx-active' : ''}`}
            onClick={() => { if (!item.disabled) pick(item.onSelect); }}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !item.disabled) { e.preventDefault(); pick(item.onSelect); } }}
          >
            {item.label}
          </div>
        );
      })}
    </div>,
    document.body,
  );
};

export default NavContextMenu;
