// 顶栏「更多」菜单：把次要操作收进一个 ⋯ 面板，避免顶栏七个控件同权重造成的视觉噪音。
//
// 设计取舍（2026-10-07）：
//   · 常驻可见：同步状态、审核队列/提交审核（协作关键路径）
//   · 收进更多：导出 Excel、导入/导出备份、版本历史、登出（低频或破坏性）
//   · 项目没有 dropdown-menu 基础组件，这里用轻量自绘面板 + 点击遮罩关闭，
//     不使用 portal（顶栏 sticky z-50，绝对定位不会被裁剪）
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import './HeaderMenu.css';

export function HeaderMenu({ children, label = '更多' }: { children: ReactNode; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const initialFocus = useRef<'first' | 'last'>('first');
  const menuId = useId();

  const closeMenu = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const items = panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)');
    if (items?.length) items[initialFocus.current === 'last' ? items.length - 1 : 0].focus();
    const onDocClick = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDocClick);
    return () => {
      document.removeEventListener('pointerdown', onDocClick);
    };
  }, [open]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      return;
    }
    if (event.key === 'Tab') {
      // 先回到触发器，再让浏览器按正常文档顺序处理 Tab / Shift+Tab。
      closeMenu(true);
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') || []);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next].focus();
  };

  return (
    <div className="relative" ref={ref} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button
        ref={triggerRef}
        type="button"
        id={`${menuId}-trigger`}
        onClick={() => { initialFocus.current = 'first'; setOpen(v => !v); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            initialFocus.current = event.key === 'ArrowUp' ? 'last' : 'first';
            setOpen(true);
          }
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={label}
        className={`header-menu-trigger flex items-center gap-1.5 h-8 px-2.5 rounded-full border text-[13px] transition-colors ${open ? 'bg-white text-[#1c1c1e] border-[#d1d1d6]' : 'bg-white/60 hover:bg-white text-[#3c3c43] border-[#e5e5ea]'}`}
      >
        <MoreHorizontal className="w-4 h-4" />
        <span className="hidden sm:inline">{label}</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          id={menuId}
          role="menu"
          aria-labelledby={`${menuId}-trigger`}
          className="header-menu-panel absolute right-0 top-10 z-[60] w-56 rounded-xl border border-black/5 bg-white/95 backdrop-blur p-1.5 shadow-xl"
          onKeyDown={handleMenuKeyDown}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('[role="menuitem"]')) closeMenu(true);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

/** 菜单项（统一样式；danger 用于登出等破坏性操作） */
export function HeaderMenuItem({ icon, children, onClick, danger }: {
  icon?: ReactNode; children: ReactNode; onClick: () => void; danger?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      data-danger={danger || undefined}
      className={`header-menu-item w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors ${danger ? 'text-rose-600 hover:bg-rose-50' : 'text-[#1c1c1e] hover:bg-black/[0.05]'}`}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** 菜单分组标题 */
export function HeaderMenuLabel({ children }: { children: ReactNode }) {
  return <p className="header-menu-label px-2.5 pt-2 pb-1 text-[11px] font-semibold text-[#8e8e93]">{children}</p>;
}
