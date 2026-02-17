import type { StatusDay } from "@/types";

interface UptimeChartProps {
  days: StatusDay[];
}

export function UptimeChart({ days }: UptimeChartProps) {
  const barWidth = 8;
  const barGap = 3;
  const height = 24;
  const totalWidth = days.length * (barWidth + barGap) - barGap;

  return (
    <svg width={totalWidth} height={height} className="inline-block">
      {days.map((day, i) => {
        let fill = "#3f3f46"; // zinc-700 (no data)
        if (day.dominant === "online") fill = "#22c55e"; // green-500
        else if (day.dominant === "offline") fill = "#ef4444"; // red-500

        return (
          <rect
            key={day.date}
            x={i * (barWidth + barGap)}
            y={0}
            width={barWidth}
            height={height}
            rx={2}
            fill={fill}
          >
            <title>{day.date}: {day.dominant ?? "no data"}</title>
          </rect>
        );
      })}
    </svg>
  );
}
