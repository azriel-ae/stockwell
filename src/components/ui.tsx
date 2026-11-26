"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, X } from "lucide-react";

/* --------------------------------- Button --------------------------------- */

type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "sage";

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md";
  loading?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-1.5 font-medium rounded-md transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
  const sizes = { sm: "h-8 px-3 text-xs", md: "h-9 px-4 text-sm" };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-charcoal text-white hover:bg-graphite",
    sage: "bg-sagedeep text-white hover:bg-[#7d8e73]",
    outline: "border border-line bg-white text-charcoal hover:bg-warmivory",
    ghost: "text-graphite hover:bg-linemuted hover:text-charcoal",
    danger: "border border-danger/30 bg-white text-danger hover:bg-dangerbg",
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? <Loader2 size={size === "sm" ? 13 : 15} className="animate-spin" /> : null}
      {children}
    </button>
  );
}

/* ---------------------------------- Inputs --------------------------------- */

const inputBase =
  "w-full h-9 rounded-md border border-line bg-white px-3 text-sm text-charcoal placeholder:text-mutedslate/70 focus:border-softsage focus:outline-none focus:ring-2 focus:ring-softsage/40 disabled:bg-linemuted";

export function Input({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${inputBase} ${className}`} {...props} />;
}

export function Select({
  className = "",
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${inputBase} pr-8 ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Textarea({
  className = "",
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`${inputBase} h-auto min-h-[72px] py-2 leading-relaxed ${className}`}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  error,
  required,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 flex items-baseline gap-1 text-xs font-medium tracking-wide text-graphite uppercase">
        {label}
        {required ? <span className="text-danger">*</span> : null}
      </span>
      {children}
      {error ? (
        <span className="mt-1 flex items-center gap-1 text-xs text-danger">
          <AlertCircle size={12} /> {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-mutedslate">{hint}</span>
      ) : null}
    </label>
  );
}

/* ---------------------------------- Badge ---------------------------------- */

export function Badge({
  tone = "neutral",
  children,
  className = "",
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "sage" | "outline";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-linemuted text-graphite",
    success: "bg-successbg text-success",
    warning: "bg-warningbg text-warning",
    danger: "bg-dangerbg text-danger",
    sage: "bg-[#e6eadf] text-sagedeep",
    outline: "border border-line bg-white text-mutedslate",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: "in_stock" | "low_stock" | "out_of_stock" }) {
  if (status === "out_of_stock") return <Badge tone="danger">Out of stock</Badge>;
  if (status === "low_stock") return <Badge tone="warning">Low stock</Badge>;
  return <Badge tone="success">In stock</Badge>;
}

export function MovementTypeBadge({ type }: { type: "in" | "out" | "adjustment" }) {
  if (type === "in") return <Badge tone="success">Stock in</Badge>;
  if (type === "out") return <Badge tone="danger">Stock out</Badge>;
  return <Badge tone="warning">Adjustment</Badge>;
}

/* ---------------------------------- Modal ---------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-charcoal/40 p-0 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-lg border border-line bg-white shadow-lg sm:rounded-lg ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-charcoal">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-xs text-mutedslate">{description}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-mutedslate hover:bg-linemuted hover:text-charcoal"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-warmivory px-5 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* -------------------------------- Empty state ------------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon ? <div className="mb-1 text-mutedslate/60">{icon}</div> : null}
      <h3 className="text-sm font-semibold text-charcoal">{title}</h3>
      <p className="max-w-sm text-xs leading-relaxed text-mutedslate">{description}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-mutedslate">
      <Loader2 size={16} className="animate-spin" />
      {label ? <span className="text-xs">{label}</span> : null}
    </div>
  );
}

/* ---------------------------------- Toast ---------------------------------- */

type Toast = { id: number; tone: "success" | "error" | "info"; message: string };

const ToastContext = createContext<{
  push: (tone: Toast["tone"], message: string) => void;
}>({ push: () => undefined });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-2 rounded-md border border-line bg-white px-3.5 py-2.5 shadow-md"
          >
            {t.tone === "success" ? (
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />
            ) : t.tone === "error" ? (
              <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" />
            ) : (
              <Info size={15} className="mt-0.5 shrink-0 text-mutedslate" />
            )}
            <p className="text-xs leading-relaxed text-charcoal">{t.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* --------------------------------- Pagination ------------------------------- */

export function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
      <p className="text-xs text-mutedslate">
        {total} item{total === 1 ? "" : "s"} · page {page} of {totalPages}
      </p>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- Form row -------------------------------- */

export function FormRow({ children, cols = 2 }: { children: ReactNode; cols?: 1 | 2 }) {
  return (
    <div className={`grid gap-4 ${cols === 2 ? "sm:grid-cols-2" : ""}`}>{children}</div>
  );
}

export function useFreshId(prefix: string): string {
  const [id] = useState(() => `${prefix}-${crypto.randomUUID()}`);
  return id;
}
