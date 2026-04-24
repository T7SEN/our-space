import { MY_TZ } from "@/lib/constants";

export function Header({ now }: { now: Date }) {
  const hour = parseInt(
    now.toLocaleString("en-US", {
      timeZone: MY_TZ,
      hour: "numeric",
      hour12: false,
    }),
  );

  let greeting = "Good evening";
  if (hour >= 5 && hour < 12) {
    greeting = "Good morning";
  } else if (hour >= 12 && hour < 18) {
    greeting = "Good afternoon";
  }

  return (
    <header className="flex flex-col gap-2 pb-2">
      <h1 className="text-4xl font-extrabold tracking-tight text-foreground">
        {greeting}.
      </h1>
      <p className="text-lg font-medium text-muted-foreground">
        Welcome back to your private space.
      </p>
    </header>
  );
}
