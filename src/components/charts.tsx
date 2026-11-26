"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { shortDate } from "@/lib/format";

const AXIS_STYLE = { fontSize: 11, fill: "#68777D" };

const TOOLTIP_STYLE = {
  borderRadius: 6,
  border: "1px solid #E4E5E0",
  fontSize: 12,
  boxShadow: "0 1px 3px rgba(37,42,45,0.08)",
};

export function MovementTrendChart({
  data,
}: {
  data: Array<{ date: string; in: number; out: number }>;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="inFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A8B5A0" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#A8B5A0" stopOpacity={0.06} />
            </linearGradient>
            <linearGradient id="outFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#AE4E42" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#AE4E42" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#ECECE7" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: "#E4E5E0" }}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => shortDate(String(l))} />
          <Area
            type="monotone"
            dataKey="in"
            name="Stock in"
            stroke="#7E8F76"
            strokeWidth={1.8}
            fill="url(#inFill)"
          />
          <Area
            type="monotone"
            dataKey="out"
            name="Stock out"
            stroke="#AE4E42"
            strokeWidth={1.8}
            fill="url(#outFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

const PALETTE = ["#A8B5A0", "#7E8F76", "#68777D", "#B5C1AE", "#41494D", "#C4CFC0"];

export function CategoryDistributionChart({
  data,
}: {
  data: Array<{ category: string; units: number }>;
}) {
  const height = Math.max(120, data.length * 32 + 24);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="#ECECE7" horizontal={false} />
          <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="category"
            tick={{ fontSize: 11, fill: "#41494D" }}
            tickLine={false}
            axisLine={{ stroke: "#E4E5E0" }}
            width={110}
          />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#F5F4EF" }} />
          <Bar dataKey="units" name="Units" radius={[0, 3, 3, 0]} barSize={16}>
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function InOutBarChart({
  data,
}: {
  data: Array<{ date: string; in: number; out: number }>;
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="#ECECE7" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={shortDate}
            tick={AXIS_STYLE}
            tickLine={false}
            axisLine={{ stroke: "#E4E5E0" }}
            minTickGap={24}
          />
          <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#F5F4EF" }} labelFormatter={(l) => shortDate(String(l))} />
          <Bar dataKey="in" name="Stock in" fill="#A8B5A0" radius={[2, 2, 0, 0]} barSize={10} />
          <Bar dataKey="out" name="Stock out" fill="#C9A49B" radius={[2, 2, 0, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
