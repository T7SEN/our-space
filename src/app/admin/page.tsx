import Link from "next/link";
import {
  Activity,
  BarChart3,
  CalendarHeart,
  Download,
  Eye,
  HeartPulse,
  KeyRound,
  Send,
  ShieldAlert,
  Smartphone,
  Smile,
  Trash2,
} from "lucide-react";
import { SummonButton } from "@/components/admin/summon-button";
import { RestraintToggle } from "@/components/admin/restraint-toggle";

const TOOLS = [
  {
    href: "/admin/stats",
    title: "Stats",
    description: "Counts, ratios, heatmap.",
    Icon: BarChart3,
  },
  {
    href: "/admin/health",
    title: "Health & repair",
    description: "Diagnostics + index reseed.",
    Icon: HeartPulse,
  },
  {
    href: "/admin/trash",
    title: "Trash & restore",
    description: "Soft-deleted records. Restore within 7 days.",
    Icon: Trash2,
  },
  {
    href: "/admin/export",
    title: "Export",
    description: "Download a JSON snapshot of every feature.",
    Icon: Download,
  },
  {
    href: "/admin/inspector",
    title: "Inspector",
    description: "Live presence + FCM token state.",
    Icon: Eye,
  },
  {
    href: "/admin/devices",
    title: "Devices",
    description: "Sessions, fingerprints, last-known location.",
    Icon: Smartphone,
  },
  {
    href: "/admin/push-test",
    title: "Send test push",
    description: "Fire a custom FCM to either author.",
    Icon: Send,
  },
  {
    href: "/admin/activity",
    title: "Activity feed",
    description: "Last 500 logged interactions.",
    Icon: Activity,
  },
  {
    href: "/admin/sessions",
    title: "Sessions",
    description: "Force-logout an author's devices.",
    Icon: KeyRound,
  },
  {
    href: "/admin/auth-log",
    title: "Auth log",
    description: "Failed login attempts (last 100).",
    Icon: ShieldAlert,
  },
  {
    href: "/admin/mood",
    title: "Mood override",
    description: "Set or clear today's mood for either author.",
    Icon: Smile,
  },
  {
    href: "/admin/dates",
    title: "Anniversary & birthdays",
    description: "Edit relationship start + per-author birthdays.",
    Icon: CalendarHeart,
  },
] as const;

export default function AdminLandingPage() {
  return (
    <main className="mx-auto max-w-3xl p-4 pb-28 md:p-12 md:pb-32">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sir-only tooling. Server-side enforced; the routes redirect anyone else.
        </p>
      </header>

      <RestraintToggle />
      <SummonButton />

      <div className="grid gap-4 md:grid-cols-2 md:gap-6">
        {TOOLS.map(({ href, title, description, Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-3 rounded-2xl border border-border/40 bg-card p-4 transition-colors hover:border-primary/40 active:scale-[0.99]"
          >
            <span className="rounded-lg bg-primary/10 p-2 text-primary">
              <Icon className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-foreground">
                {title}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {description}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </main>
  );
}
