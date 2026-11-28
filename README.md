# Stockwell

**Know your stock. Stay in control.**

Stockwell is an inventory management application that uses **[Drivebase](https://drivebaseaz.vercel.app/) as its database backend and storage provider** — it is the first external application consuming Drivebase end-to-end: products, categories, suppliers, the stock movement ledger and even product images live behind the Drivebase API (Google Sheets / Google Drive underneath), not in any local or alternative database.

Built with Next.js (App Router) + TypeScript + Tailwind CSS + Recharts + Zod.

---

## Architecture

```
Browser ── Stockwell server
              │   
              ▼
Drivebase REST API 
              │
              ▼
Google Sheets / Google Drive 
```
