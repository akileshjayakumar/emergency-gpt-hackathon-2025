"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import type React from "react";

// Compress images on the client to speed up uploads and inference
async function compressImageToJpeg(
  file: File,
  options: { maxDimension?: number; quality?: number } = {}
): Promise<File> {
  const { maxDimension = 1280, quality = 0.82 } = options;
  // Try fast path with createImageBitmap
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height)
    );
    const targetW = Math.round(bitmap.width * scale);
    const targetH = Math.round(bitmap.height * scale);
    const canvas: HTMLCanvasElement | OffscreenCanvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(targetW, targetH)
        : Object.assign(document.createElement("canvas"), {
            width: targetW,
            height: targetH,
          });
    const rawCtx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext(
      "2d"
    );
    const isCanvas2DContext = (
      ctx: unknown
    ): ctx is CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D => {
      return (
        !!ctx &&
        typeof (ctx as CanvasRenderingContext2D).fillRect === "function" &&
        "fillStyle" in (ctx as Record<string, unknown>)
      );
    };
    if (!isCanvas2DContext(rawCtx)) return file;
    const ctx = rawCtx;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(bitmap, 0, 0, targetW, targetH);
    const isOffscreen = (
      c: HTMLCanvasElement | OffscreenCanvas
    ): c is OffscreenCanvas =>
      typeof (c as OffscreenCanvas).convertToBlob === "function";
    const blob: Blob = isOffscreen(canvas)
      ? await (canvas as OffscreenCanvas).convertToBlob({
          type: "image/jpeg",
          quality,
        })
      : await new Promise((resolve) =>
          (canvas as HTMLCanvasElement).toBlob(
            (b) => resolve((b as Blob) || new Blob()),
            "image/jpeg",
            quality
          )
        );
    return new File([blob], "upload.jpg", { type: "image/jpeg" });
  } catch {
    // Fallback path via <img>
    return new Promise<File>((resolve) => {
      const img = document.createElement("img");
      img.src = URL.createObjectURL(file);
      img.onload = async () => {
        const scale = Math.min(
          1,
          maxDimension / Math.max(img.width, img.height)
        );
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(file);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (b) => {
            URL.revokeObjectURL(img.src);
            if (!b) return resolve(file);
            resolve(new File([b], "upload.jpg", { type: "image/jpeg" }));
          },
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => resolve(file);
    });
  }
}

function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-4 border-2 border-white/60 border-t-white rounded-full animate-spin ${className}`}
    />
  );
}

type ExtractResponse = {
  items: { name: string; price: number }[];
};

type AnalyseResponse = {
  cheapest: { name: string; price: number; calories: [number, number] }[];
  most_expensive: { name: string; price: number; calories: [number, number] }[];
  healthiest: {
    name: string;
    price: number;
    calories: [number, number];
  } | null;
  most_filling: {
    name: string;
    price: number;
    calories: [number, number];
  } | null;
  follow_up_questions: string[];
};

export default function Home() {
  const [image, setImage] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [items, setItems] = useState<ExtractResponse["items"] | null>(null);
  const [analysis, setAnalysis] = useState<AnalyseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [phase, setPhase] = useState<
    "idle" | "extracting" | "analysing" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatting, setIsChatting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const canAnalyse = useMemo(() => !!items && items.length > 0, [items]);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] || null;
    setImage(file);
    setItems(null);
    setAnalysis(null);
    setError(null);
    if (file) {
      setPreviewUrl(URL.createObjectURL(file));
      await processImage(file);
    } else {
      setPreviewUrl(null);
    }
  }

  function handleClickCamera() {
    cameraInputRef.current?.click();
  }

  function handleClickGallery() {
    galleryInputRef.current?.click();
  }

  function buildSystemPrompt(): string {
    const itemsJson = items ? JSON.stringify({ items }) : "null";
    return [
      "You are a helpful nutrition and food assistant specialising in Singapore hawker centre food.",
      "You know common dish names, typical prices in SGD, healthier swaps, and rough calorie ranges.",
      "Always assume prices are in SGD and format as $ X.XX. Be concise and practical.",
      "If you are unsure, ask a short clarifying question before answering.",
      "You are given the user's extracted menu items as JSON. Use them as the source of truth if present.",
      `Extracted menu items JSON: ${itemsJson}`,
    ].join("\n");
  }

  async function handleExtract() {
    try {
      if (!image) return;
      setLoading(true);
      setError(null);
      const form = new FormData();
      // Compress to speed up upload/inference while preserving readability
      const optimized = await compressImageToJpeg(image, {
        maxDimension: 1280,
        quality: 0.82,
      });
      form.append("image", optimized);
      const res = await fetch("/api/extract", { method: "POST", body: form });
      if (!res.ok) throw new Error(`Extract failed (${res.status})`);
      const data: ExtractResponse = await res.json();
      setItems(data.items || []);
      setAnalysis(null);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to extract");
    } finally {
      setLoading(false);
    }
  }

  async function handleAnalyse() {
    try {
      if (!canAnalyse) return;
      setLoading(true);
      setError(null);
      const res = await fetch("/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error(`Analyse failed (${res.status})`);
      const data: AnalyseResponse = await res.json();
      setAnalysis(data);
      // Seed chat with system context and a helpful intro if not already started
      setChatMessages([
        {
          role: "assistant",
          content: "Hi! Ask me about the menu, nutrition, or value picks.",
        },
      ]);
    } catch (e: unknown) {
      setError((e as Error).message || "Failed to analyse");
    } finally {
      setLoading(false);
    }
  }

  // New: single smooth flow after user selects an image
  async function processImage(file: File) {
    try {
      setLoading(true);
      setPhase("extracting");
      setItems(null);
      setAnalysis(null);
      setChatOpen(false);

      // Extract
      const form = new FormData();
      const optimized = await compressImageToJpeg(file, {
        maxDimension: 1280,
        quality: 0.82,
      });
      form.append("image", optimized);
      const extractRes = await fetch("/api/extract", {
        method: "POST",
        body: form,
      });
      if (!extractRes.ok)
        throw new Error(`Extract failed (${extractRes.status})`);
      const extractData: ExtractResponse = await extractRes.json();
      const extractedItems = extractData.items || [];
      setItems(extractedItems);

      // Analyse
      setPhase("analysing");
      const analyseRes = await fetch("/api/analyse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: extractedItems }),
      });
      if (!analyseRes.ok)
        throw new Error(`Analyse failed (${analyseRes.status})`);
      const analyseData: AnalyseResponse = await analyseRes.json();
      setAnalysis(analyseData);
      setChatMessages([
        {
          role: "assistant",
          content: "Hi! Ask me about the menu, nutrition, or value picks.",
        },
      ]);
      setChatOpen(true);
      setPhase("done");
    } catch (e: unknown) {
      setError((e as Error).message || "Processing failed");
      setPhase("idle");
    } finally {
      setLoading(false);
    }
  }

  async function askChat(question: string) {
    try {
      setChatOpen(true);
      const newMessages = [
        ...chatMessages,
        { role: "user" as const, content: question },
      ];
      setChatMessages(newMessages);
      // Build payload with a system prompt that includes extracted items and expert persona
      const payloadMessages = [
        { role: "system" as const, content: buildSystemPrompt() },
        ...newMessages,
      ];

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: payloadMessages }),
      });
      if (!res.ok || !res.body) throw new Error(`Chat failed (${res.status})`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      setIsChatting(true);
      setChatMessages((prev: typeof chatMessages) => [
        ...prev,
        { role: "assistant", content: "" },
      ]);
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        assistantText += decoder.decode(value, { stream: true });
        setChatMessages((prev: typeof chatMessages) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: assistantText,
          };
          return updated;
        });
      }
      setIsChatting(false);
    } catch (e: unknown) {
      setError((e as Error).message || "Chat failed");
      setIsChatting(false);
    }
  }

  async function handleSendChat() {
    const q = chatInput.trim();
    if (!q) return;
    setChatInput("");
    await askChat(q);
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <div className="mx-auto max-w-5xl p-4 sm:p-6">
        <h1 className="text-2xl md:text-3xl font-semibold text-gray-900">
          Hawker Food Menu Helper
        </h1>
        <p className="text-gray-600 text-sm md:text-base mt-1">
          Upload a menu photo to extract dishes and get healthy, value picks.
        </p>

        <div className="mt-6 space-y-4">
          <div className="card">
            <label className="block text-sm font-medium text-gray-700">
              Menu image
            </label>
            {/* Hidden inputs to support camera and gallery */}
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              capture="environment"
              onChange={onFileChange}
              className="hidden"
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              onChange={onFileChange}
              className="hidden"
            />
            <div className="mt-2 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={handleClickCamera}
                className="btn btn-outline btn-lg w-full"
              >
                Take photo
              </button>
              <button
                type="button"
                onClick={handleClickGallery}
                className="btn btn-primary btn-lg w-full"
              >
                Choose from gallery
              </button>
            </div>
            {previewUrl && (
              <img
                src={previewUrl}
                alt="preview"
                className="mt-3 w-full rounded-lg object-contain max-h-[70vh] bg-gray-50"
              />
            )}
            {loading && (
              <div className="mt-4 w-full rounded-lg bg-emerald-200/80 text-emerald-900 px-4 py-3 text-center text-base md:text-lg">
                <span className="inline-flex items-center gap-2 justify-center">
                  <Spinner className="border-emerald-900/40 border-t-emerald-900" />
                  {phase === "extracting"
                    ? "Extracting items..."
                    : "Analysing menu..."}
                </span>
              </div>
            )}
          </div>

          {items && (
            <div className="card">
              <h2 className="text-lg md:text-xl font-medium text-gray-900">
                Extracted items
              </h2>
              <ul className="mt-2 divide-y divide-gray-100">
                {items.map(
                  (it: ExtractResponse["items"][number], idx: number) => (
                    <li
                      key={idx}
                      className="py-2 flex items-center justify-between"
                    >
                      <span className="text-gray-800">{it.name}</span>
                      <span className="text-gray-600">
                        $ {it.price.toFixed(2)}
                      </span>
                    </li>
                  )
                )}
              </ul>
              {/* Analyse button removed; analysis runs automatically after extraction */}
            </div>
          )}

          {analysis && (
            <div className="space-y-4">
              {analysis.cheapest?.length > 0 && (
                <div className="card border-l-4 border-[var(--sg-yellow)]">
                  <h3 className="text-base md:text-lg font-semibold text-gray-700">
                    Cheapest Option
                  </h3>
                  <ul className="mt-1 space-y-1">
                    {analysis.cheapest.map(
                      (c: AnalyseResponse["cheapest"][number], i: number) => (
                        <li key={i}>
                          <p className="text-gray-900 font-medium text-lg">
                            {c.name}
                          </p>
                          <p className="text-gray-600 text-sm">
                            $ {c.price.toFixed(2)} • {c.calories[0]}–
                            {c.calories[1]} kcal
                          </p>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
              {analysis.most_expensive?.length > 0 && (
                <div className="card border-l-4 border-[var(--sg-red)]">
                  <h3 className="text-base md:text-lg font-semibold text-gray-700">
                    Most Expensive Option
                  </h3>
                  <ul className="mt-1 space-y-1">
                    {analysis.most_expensive.map(
                      (
                        m: AnalyseResponse["most_expensive"][number],
                        i: number
                      ) => (
                        <li key={i}>
                          <p className="text-gray-900 font-medium text-lg">
                            {m.name}
                          </p>
                          <p className="text-gray-600 text-sm">
                            $ {m.price.toFixed(2)} • {m.calories[0]}–
                            {m.calories[1]} kcal
                          </p>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
              {analysis.healthiest && (
                <div className="card border-l-4 border-[var(--sg-emerald)]">
                  <h3 className="text-base md:text-lg font-semibold text-gray-700">
                    Healthiest Option
                  </h3>
                  <p className="mt-1 text-gray-900 font-medium text-lg">
                    {analysis.healthiest.name}
                  </p>
                  <p className="text-gray-600 text-sm">
                    $ {analysis.healthiest.price.toFixed(2)} •{" "}
                    {analysis.healthiest.calories[0]}–
                    {analysis.healthiest.calories[1]} kcal
                  </p>
                </div>
              )}
              {analysis.most_filling && (
                <div className="card border-l-4 border-gray-400">
                  <h3 className="text-base md:text-lg font-semibold text-gray-700">
                    Most Filling Option
                  </h3>
                  <p className="mt-1 text-gray-900 font-medium text-lg">
                    {analysis.most_filling.name}
                  </p>
                  <p className="text-gray-600 text-sm">
                    $ {analysis.most_filling.price.toFixed(2)} •{" "}
                    {analysis.most_filling.calories[0]}–
                    {analysis.most_filling.calories[1]} kcal
                  </p>
                </div>
              )}
              {analysis.follow_up_questions?.length > 0 && (
                <div className="card">
                  <h3 className="text-sm md:text-base font-semibold text-gray-700">
                    Suggested questions
                  </h3>
                  <div className="mt-2 grid gap-2">
                    {analysis.follow_up_questions.map(
                      (q: string, i: number) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => askChat(q)}
                          className="text-left w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-900 hover:bg-[var(--muted)]"
                        >
                          {q}
                        </button>
                      )
                    )}
                  </div>
                </div>
              )}
              {/* Chat panel */}
              {chatOpen && (
                <div className="card">
                  <h3 className="text-sm md:text-base font-semibold text-gray-700">
                    Chat
                  </h3>
                  <div className="mt-2 max-h-80 overflow-y-auto space-y-2">
                    {chatMessages.map(
                      (
                        m: { role: "user" | "assistant"; content: string },
                        idx: number
                      ) => (
                        <div
                          key={idx}
                          className={`flex ${
                            m.role === "user" ? "justify-end" : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed shadow-sm ${
                              m.role === "user"
                                ? "bg-emerald-600 text-white"
                                : "bg-gray-100 text-gray-900"
                            }`}
                          >
                            {m.role === "assistant" ? (
                              <ReactMarkdown
                                components={{
                                  p: ({
                                    children,
                                  }: {
                                    children?: React.ReactNode;
                                  }) => <p className="markdown">{children}</p>,
                                }}
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeSanitize]}
                              >
                                {m.content}
                              </ReactMarkdown>
                            ) : (
                              m.content
                            )}
                          </div>
                        </div>
                      )
                    )}
                    {isChatting && (
                      <div className="flex justify-start">
                        <div className="rounded-2xl bg-gray-100 text-gray-900 px-3 py-2 text-sm shadow-sm">
                          <span className="inline-flex gap-1">
                            <span className="animate-bounce [animation-delay:-0.2s]">
                              •
                            </span>
                            <span className="animate-bounce">•</span>
                            <span className="animate-bounce [animation-delay:0.2s]">
                              •
                            </span>
                          </span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <input
                      value={chatInput}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setChatInput(e.target.value)
                      }
                      onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSendChat();
                        }
                      }}
                      placeholder="Type your question..."
                      className="flex-1 rounded-full border border-gray-300 px-4 py-3 text-base md:text-lg text-gray-900 placeholder:text-gray-400 bg-white"
                      disabled={isChatting}
                    />
                    <button
                      type="button"
                      onClick={handleSendChat}
                      disabled={isChatting}
                      className="rounded-full btn btn-primary btn-lg px-6 disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
