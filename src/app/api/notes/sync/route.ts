import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { decrypt } from "@/lib/auth-utils";
import { logger } from "@/lib/logger";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const INDEX_KEY = "notes:index";
const MAX_CONTENT_LENGTH = 2000;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("session")?.value;
  const session = sessionCookie ? await decrypt(sessionCookie) : null;

  if (!session?.author) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const content = (body.content as string | undefined)?.trim();
  const clientId = (body.id as string | undefined) ?? "";
  const createdAt =
    typeof body.createdAt === "number" ? body.createdAt : Date.now();

  if (!content) {
    return NextResponse.json({ error: "Empty content." }, { status: 400 });
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: "Content too long." }, { status: 400 });
  }

  const note = {
    id: clientId || crypto.randomUUID(),
    content,
    author: session.author,
    createdAt,
  };

  const noteKey = `note:${note.id}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.set(noteKey, note);
    pipeline.zadd(INDEX_KEY, { score: note.createdAt, member: note.id });
    pipeline.incr(`notes:count:${session.author}`);
    await pipeline.exec();

    return NextResponse.json({ success: true, id: note.id });
  } catch (error) {
    logger.error("[sync] Failed to save offline note:", error);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
