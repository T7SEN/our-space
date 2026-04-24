"use server";

export type QuoteData = {
  text: string;
  author: string;
};

export async function fetchRandomQuote(): Promise<QuoteData> {
  try {
    // Fetch a public, static JSON database of love quotes hosted on GitHub's Edge CDN.
    // We cache the file on your server for 24 hours so that generating a random
    // quote on page refresh is absolutely instantaneous.
    const res = await fetch(
      "https://raw.githubusercontent.com/btford/philosobot/master/quotes/love.json",
      {
        next: { revalidate: 86400 }, // Cache for 24 hours
        signal: AbortSignal.timeout(5000),
      },
    );

    if (!res.ok) {
      throw new Error(`GitHub CDN returned status: ${res.status}`);
    }

    const json = await res.json();

    if (json.quotes && json.quotes.length > 0) {
      const randomIndex = Math.floor(Math.random() * json.quotes.length);
      const randomQuote = json.quotes[randomIndex];

      // Intercept and replace HTML breaks with clean newline characters
      const cleanText = randomQuote.quote.replace(/<br\s*\/?>/gi, "\n");

      return {
        text: cleanText,
        author: randomQuote.author || "Unknown",
      };
    }

    throw new Error("JSON returned empty array");
  } catch (error) {
    console.error("API Error:", error);

    // If anything goes wrong, it prints exactly what happened to the UI
    return {
      text: `System Error: ${error instanceof Error ? error.message : "Unknown connection error."}`,
      author: "Debug Output",
    };
  }
}
