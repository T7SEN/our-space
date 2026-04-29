type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  error?: Error | string | null;
  context?: LogContext;
  timestamp: string;
}

class Logger {
  private queue: LogEntry[] = [];
  private isProcessing = false;

  // Rate limiting: Allow max 5 webhook calls per 10 seconds
  private rateLimitWindowMs = 10000;
  private maxRequestsPerWindow = 5;
  private requestsInCurrentWindow = 0;
  private windowResetTimer: NodeJS.Timeout | null = null;

  /**
   * Safely stringifies objects that might contain circular references
   * (very common in React Error boundaries and DOM events).
   */
  private safeStringify(obj: unknown): string {
    const cache = new Set();
    try {
      return JSON.stringify(
        obj,
        (key, value) => {
          if (typeof value === "object" && value !== null) {
            if (cache.has(value)) return "[Circular Reference]";
            cache.add(value);
          }
          // Filter out massive React DOM elements
          if (
            key === "_owner" ||
            key === "$$typeof" ||
            (typeof value === "object" && value !== null && "nodeType" in value)
          ) {
            return "[React/DOM Internal]";
          }
          return value;
        },
        2,
      );
    } catch {
      return "[Unserializable Object]";
    }
  }

  /**
   * Formats the log for the local development console.
   */
  private consoleLog(entry: LogEntry) {
    if (
      process.env.NODE_ENV === "production" &&
      entry.level !== "error" &&
      entry.level !== "fatal"
    ) {
      return; // Keep production console clean
    }

    const timestamp = new Date(entry.timestamp).toLocaleTimeString();
    const prefix = `[${timestamp}] [${entry.level.toUpperCase()}]`;

    switch (entry.level) {
      case "debug":
        console.debug(prefix, entry.message, entry.context || "");
        break;
      case "info":
        console.info(
          `\x1b[36m${prefix}\x1b[0m`,
          entry.message,
          entry.context || "",
        ); // Cyan
        break;
      case "warn":
        console.warn(
          `\x1b[33m${prefix}\x1b[0m`,
          entry.message,
          entry.context || "",
        ); // Yellow
        break;
      case "error":
      case "fatal":
        console.error(
          `\x1b[31m${prefix}\x1b[0m`,
          entry.message,
          entry.error || "",
          entry.context || "",
        ); // Red
        break;
    }
  }

  /**
   * Manages the rate limit window to prevent Webhook API bans.
   */
  private checkRateLimit(): boolean {
    if (this.requestsInCurrentWindow >= this.maxRequestsPerWindow) {
      return false;
    }

    this.requestsInCurrentWindow++;

    if (!this.windowResetTimer) {
      this.windowResetTimer = setTimeout(() => {
        this.requestsInCurrentWindow = 0;
        this.windowResetTimer = null;
        void this.processQueue(); // Trigger queue processing if items were waiting
      }, this.rateLimitWindowMs);
    }

    return true;
  }

  /**
   * Processes the offline/throttled queue sequentially.
   */
  private async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    // Ensure we aren't firing in non-production environments
    if (process.env.NODE_ENV !== "production") {
      this.queue = [];
      return;
    }

    const webhookUrl = process.env.NEXT_PUBLIC_DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      this.queue = []; // Nowhere to send them, clear queue
      return;
    }

    this.isProcessing = true;

    while (this.queue.length > 0) {
      if (!this.checkRateLimit()) {
        // Rate limit hit. Stop processing. The timer will restart us.
        break;
      }

      // Peek at the first item
      const entry = this.queue[0];

      try {
        const errorMessage =
          entry.error instanceof Error
            ? `${entry.error.name}: ${entry.error.message}\n${entry.error.stack}`
            : String(entry.error || "N/A");

        const safeError =
          errorMessage.length > 600
            ? errorMessage.slice(0, 600) + "\n...[TRUNCATED]"
            : errorMessage;

        const safeContextString = this.safeStringify(entry.context || {});
        const safeContext =
          safeContextString.length > 800
            ? safeContextString.slice(0, 800) + "\n...[TRUNCATED]"
            : safeContextString;

        let finalContent = `🚨 **Our Space Crash Report** 🚨\n**Level:** ${entry.level.toUpperCase()}\n**Message:** ${entry.message}\n**Error:**\n\`\`\`text\n${safeError}\n\`\`\`\n**Context:**\n\`\`\`json\n${safeContext}\n\`\`\``;

        if (finalContent.length > 2000) {
          finalContent = finalContent.slice(0, 1995) + "...";
        }

        const payload = { content: finalContent };

        const response = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
        });

        if (!response.ok) {
          // 1. Respect Discord's rate limits to avoid getting IP banned
          if (response.status === 429) {
            console.warn("[Logger] Discord rate limit hit (429). Backing off.");
            break;
          }

          // 2. Intelligently parse Discord's error response
          let errorDetail = "";
          try {
            const json = await response.json();
            errorDetail = JSON.stringify(json);
          } catch {
            errorDetail = await response.text();
          }

          console.error(
            `[Logger] Discord Rejected! Status: ${response.status}`,
            errorDetail,
          );

          // Break to prevent spamming the same broken payload in an infinite loop
          break;
        } else {
          // 3. Keep production logs perfectly clean, only log success locally
          if (process.env.NODE_ENV !== "production") {
            console.info(
              "\x1b[36m[Logger] SUCCESS! Payload delivered to Discord.\x1b[0m",
            );
          }
        }

        // Successfully sent (or fatally rejected), remove from queue
        this.queue.shift();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {
        // Network error (offline). Stop processing.
        // The queue remains intact for the next attempt.
        console.error("[Logger] Network failure, queueing log for later.");
        break;
      }
    }

    this.isProcessing = false;
  }

  private log(
    level: LogLevel,
    message: string,
    error?: unknown,
    context?: LogContext,
  ) {
    const entry: LogEntry = {
      level,
      message,
      error:
        error instanceof Error
          ? error
          : error
            ? new Error(String(error))
            : null,
      context,
      timestamp: new Date().toISOString(),
    };

    // 1. Always log to console locally
    this.consoleLog(entry);

    // 2. Only queue 'error' and 'fatal' levels for webhooks to save bandwidth
    if (level === "error" || level === "fatal") {
      this.queue.push(entry);

      // Prevent memory leaks if the device goes offline forever
      if (this.queue.length > 50) {
        this.queue = this.queue.slice(-50);
      }

      void this.processQueue();
    }
  }

  public debug(message: string, context?: LogContext) {
    this.log("debug", message, undefined, context);
  }

  public info(message: string, context?: LogContext) {
    this.log("info", message, undefined, context);
  }

  public warn(message: string, context?: LogContext) {
    this.log("warn", message, undefined, context);
  }

  public error(message: string, err?: unknown, context?: LogContext) {
    this.log("error", message, err, context);
  }

  public fatal(message: string, err?: unknown, context?: LogContext) {
    this.log("fatal", message, err, context);
  }
}

// Export as a singleton
export const logger = new Logger();
