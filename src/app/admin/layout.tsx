import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth-utils";
import type { ReactNode } from "react";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const session = await decrypt(cookieStore.get("session")?.value);
  if (!session?.author || session.author !== "T7SEN") {
    redirect("/");
  }
  return <>{children}</>;
}
