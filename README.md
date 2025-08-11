## Hawker Food Menu Helper

Built at EMERGENCY GPT HACKATHON 2025 (Singapore). Event: [Luma page](https://lu.ma/dn2iqbwu?tk=kM5Qjp).

### What it does

- Upload a hawker stall menu photo (PNG/JPEG)
- Extract dish names and prices
- Analyse the menu for cheapest, most expensive, healthiest, and most filling
- Chat with a hawker food assistant for tips and healthier swaps

### Models used

- Image processing (OCR-style extraction): `meta-llama/Llama-4-Scout-17B-16E-Instruct` on Groq. See model card on Hugging Face: [`meta-llama/Llama-4-Scout-17B-16E-Instruct`](https://huggingface.co/meta-llama/Llama-4-Scout-17B-16E-Instruct).
- Chat assistant: `openai/gpt-oss-20b` on Groq. See model card on Hugging Face: [`openai/gpt-oss-20b`](https://huggingface.co/openai/gpt-oss-20b).

### Tech stack

- Next.js 15, React 19, TypeScript
- Tailwind CSS v4
- AI SDK + Groq for LLM/VLM

### Quick start

1. Install

```bash
npm install
```

2. Environment

Create `.env.local`:

```bash
GROQ_API_KEY=your_groq_api_key
# Optional: override the default vision model used by `/api/extract`
GROQ_VISION_MODEL=meta-llama/llama-4-scout-17b-16e-instruct
```

3. Run

```bash
npm run dev
```

Open http://localhost:3000.

### API (brief)

- POST `/api/extract` (multipart/form-data: `image`) → `{ items: [{ name, price }] }`  
  Example:

  ```bash
  curl -X POST http://localhost:3000/api/extract \
    -F "image=@/path/to/menu.jpg"
  ```

- POST `/api/analyse` (JSON: `{ items: [...] }`) → analysis summary

- POST `/api/chat` (JSON: `{ messages: [...] }`) → streamed text reply. Optional `context.items` to ground the chat.

### Scripts

- `npm run dev` start dev server
- `npm run build` build
- `npm run start` run production server
- `npm run lint` lint

### Acknowledgements

- Built at the EMERGENCY GPT HACKATHON 2025
- Thanks to OpenAI, Groq, and organizers

### License

MIT License. See [LICENSE](LICENSE).
