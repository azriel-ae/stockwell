/**
 * Zod input schemas — validated on the Stockwell server BEFORE anything is
 * sent to Drivebase (Drivebase validates again against the table schema).
 */

import { z } from "zod";
import { CURRENCIES } from "./stock";

const trimmed = (min: number, max: number) => z.string().trim().min(min).max(max);

export const skuSchema = trimmed(1, 64).regex(
  /^[A-Za-z0-9][A-Za-z0-9_-]*$/,
  "SKU must contain only letters, numbers, dashes and underscores",
);

export const productCreateSchema = z.object({
  sku: skuSchema,
  name: trimmed(1, 200),
  description: z.string().trim().max(5000).optional().nullable(),
  categoryId: z.string().trim().min(1).optional().nullable(),
  supplierId: z.string().trim().min(1).optional().nullable(),
  purchasePrice: z.number().min(0).max(1_000_000_000_000).optional().nullable(),
  sellingPrice: z.number().min(0).max(1_000_000_000_000).optional().nullable(),
  stockQuantity: z.number().int().min(0).max(1_000_000_000).default(0),
  minimumStock: z.number().int().min(0).max(1_000_000_000).default(0),
  unit: z.string().trim().max(32).optional().nullable(),
  imageFileId: z.string().trim().min(8).max(64).optional().nullable(),
});

export const productUpdateSchema = productCreateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  "Provide at least one field to update",
);

export const categoryCreateSchema = z.object({
  name: trimmed(1, 80),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const categoryUpdateSchema = categoryCreateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  "Provide at least one field to update",
);

export const supplierCreateSchema = z.object({
  name: trimmed(1, 120),
  contactPerson: z.string().trim().max(120).optional().nullable(),
  email: z.string().trim().email("Enter a valid email address").max(200).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const supplierUpdateSchema = supplierCreateSchema.partial().refine(
  (v) => Object.keys(v).length > 0,
  "Provide at least one field to update",
);

export const movementCreateSchema = z
  .object({
    productId: trimmed(1, 64),
    movementType: z.enum(["in", "out", "adjustment"]),
    quantity: z.number().int().min(-1_000_000_000).max(1_000_000_000),
    notes: z.string().trim().max(2000).optional().nullable(),
    referenceNumber: z.string().trim().max(64).optional().nullable(),
    /** Client-generated once per user action; makes retries safe. */
    idempotencyKey: trimmed(8, 128),
  })
  .refine((v) => v.movementType !== "adjustment" || (v.notes ?? "").length >= 3, {
    message: "Stock adjustment requires a reason (notes)",
    path: ["notes"],
  })
  .refine((v) => v.movementType === "adjustment" || v.quantity > 0, {
    message: "Quantity must be greater than zero",
    path: ["quantity"],
  });

export const settingsUpdateSchema = z.object({
  businessName: z.string().trim().min(1).max(120),
  businessDescription: z.string().trim().max(1000),
  currency: z.enum(CURRENCIES),
  defaultUnit: z.string().trim().min(1).max(32),
  lowStockThreshold: z.number().int().min(0).max(1_000_000),
});

export const reportQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  categoryId: z.string().trim().min(1).optional(),
});

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
export type SupplierCreateInput = z.infer<typeof supplierCreateSchema>;
export type SupplierUpdateInput = z.infer<typeof supplierUpdateSchema>;
export type MovementCreateInput = z.infer<typeof movementCreateSchema>;
export type SettingsUpdateInput = z.infer<typeof settingsUpdateSchema>;
